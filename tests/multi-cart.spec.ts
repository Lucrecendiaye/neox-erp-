import { test, expect, type Page, type Browser } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { seedDemoData } from './helpers'

const dir = path.dirname(fileURLToPath(import.meta.url))
const state = JSON.parse(fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8'))

async function openPOS(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport, storageState: state })
  const page = await ctx.newPage()
  await page.goto('/pos')
  await page.waitForLoadState('load')
  await page.waitForTimeout(2500)
  const seeded = await seedDemoData(page)
  if (!seeded.ok) throw new Error('seed failed: ' + (seeded.reason || 'unknown'))
  // ensure products are rendered
  await expect(page.locator('button', { hasText: 'Ajouter' }).first()).toBeVisible({ timeout: 10000 })
  return ctx
}

async function addProduct(page: Page, name: string) {
  await page.getByPlaceholder(/Rechercher/).fill(name)
  await page.waitForTimeout(300)
  await page.locator('button', { hasText: 'Ajouter' }).first().click()
  await page.getByPlaceholder(/Rechercher/).fill('')
  await page.waitForTimeout(300)
}

test('Test 1: deux paniers indépendants sans contamination', async ({ browser }) => {
  const ctx = await openPOS(browser, { width: 1440, height: 900 })
  const page = ctx.pages()[0]

  // P1: ajouter un Coca
  await addProduct(page, 'Coca')
  await expect(page.getByTestId('cart-tab-0')).toContainText('1 art.')
  await expect(page.getByText('Coca-Cola 33cl')).toBeVisible()

  // Mettre P1 en attente -> bascule vers P2
  await page.getByTestId('cart-hold').click()
  await expect(page.getByTestId('cart-tab-0')).toContainText('En attente')
  await expect(page.getByTestId('cart-tab-1')).toContainText('Nouveau')

  // P2: ajouter une Eau -> ne doit pas toucher P1
  await addProduct(page, 'Eau')
  await expect(page.getByTestId('cart-tab-1')).toContainText('1 art.')
  await expect(page.getByTestId('cart-tab-0')).toContainText('1 art.')
  await expect(page.getByTestId('cart-tab-0')).toContainText('En attente')

  // Revenir à P1: son article est intact
  await page.getByTestId('cart-tab-0').click()
  await expect(page.getByText('Coca-Cola 33cl').first()).toBeVisible()
  await expect(page.getByText('Eau Minérale 1.5L')).toHaveCount(0)

  await ctx.close()
})

test('Test 2: maximum 4 paniers (queue protégée)', async ({ browser }) => {
  const ctx = await openPOS(browser, { width: 1440, height: 900 })
  const page = ctx.pages()[0]

  for (const [name] of [['Coca'], ['Eau'], ['Riz'], ['Savon']] as [string][]) {
    await addProduct(page, name)
    await page.getByTestId('cart-hold').click()
    await page.waitForTimeout(200)
  }

  // Les 4 sont occupés
  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId(`cart-tab-${i}`)).not.toContainText('Nouveau')
  }

  await page.getByTestId('cart-new').click()
  await expect(page.getByText('4 paniers maximum')).toBeVisible()

  await ctx.close()
})

test('Test 3: finaliser ne valide et ne vide que le panier actif', async ({ browser }) => {
  const ctx = await openPOS(browser, { width: 1440, height: 900 })
  const page = ctx.pages()[0]

  // P1 rempli puis en attente
  await addProduct(page, 'Coca')
  await expect(page.getByTestId('cart-tab-0')).toContainText('1 art.')
  await page.getByTestId('cart-hold').click()

  // P2 rempli (reste intact après finalisation)
  await addProduct(page, 'Riz')
  await expect(page.getByTestId('cart-tab-1')).toContainText('1 art.')

  // Revenir à P1 et finaliser
  await page.getByTestId('cart-tab-0').click()
  await page.locator('button', { hasText: /Valider/ }).click()
  await expect(page.getByText('Vente confirmée !')).toBeVisible({ timeout: 15000 })

  // la vente a bien été enregistrée
  const salesBefore = await page.evaluate(async () => {
    const db = (await import('/src/db')).default
    return db.sales.count()
  })
  await page.getByRole('button', { name: 'Nouvelle vente' }).click()

  // P1 est réinitialisé, P2 intact
  await expect(page.getByTestId('cart-tab-0')).toContainText('Nouveau')
  await expect(page.getByTestId('cart-tab-1')).toContainText('1 art.')

  const salesAfter = await page.evaluate(async () => {
    const db = (await import('/src/db')).default
    return db.sales.count()
  })
  expect(salesAfter).toBe(salesBefore + 1)

  await ctx.close()
})

test('Test 4: client propre à chaque panier', async ({ browser }) => {
  const ctx = await openPOS(browser, { width: 1440, height: 900 })
  const page = ctx.pages()[0]

  // P1: ajouter article + client
  await addProduct(page, 'Coca')
  await page.locator('button', { hasText: 'Client' }).click()
  await page.getByPlaceholder('Nom du client').fill('Awa Ouédraogo')
  await expect(page.getByTestId('cart-tab-0')).toContainText('Awa Ouédraogo')

  // P2: autre client
  await page.getByTestId('cart-hold').click()
  await addProduct(page, 'Riz')
  await page.getByPlaceholder('Nom du client').fill('Ibrahim Traoré')
  await expect(page.getByTestId('cart-tab-1')).toContainText('Ibrahim Traoré')

  // Les clients ne se mélangent pas
  await page.getByTestId('cart-tab-0').click()
  await expect(page.getByTestId('cart-tab-0')).toContainText('Awa Ouédraogo')
  await expect(page.getByTestId('cart-tab-1')).toContainText('Ibrahim Traoré')

  await ctx.close()
})

test('Test 5: sélecteur de paniers mobile (4 chips + bascule)', async ({ browser }) => {
  const ctx = await openPOS(browser, { width: 390, height: 844 })
  const page = ctx.pages()[0]

  // Le sélecteur de 4 paniers est visible et scrollable
  await expect(page.getByTestId('cart-tab-0')).toBeVisible()
  await expect(page.getByTestId('cart-tab-1')).toBeVisible()

  // Ajouter un article sur mobile
  await addProduct(page, 'Coca')
  await page.waitForTimeout(300)
  await expect(page.getByTestId('cart-tab-0')).toContainText('1 art.')

  // La barre basse indique le panier actif
  await expect(page.getByText('Panier P1', { exact: false }).first()).toBeVisible()

  // Bascule vers P2 puis retour à P1
  await page.getByTestId('cart-tab-1').click()
  await page.getByTestId('cart-tab-0').click()
  await expect(page.getByTestId('cart-tab-0')).toContainText('1 art.')

  await ctx.close()
})