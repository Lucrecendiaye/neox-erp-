import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { seedDemoData } from './helpers'

const STATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth-state.json')

async function ensureLoggedIn(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
  if (page.url().includes('/login')) {
    throw new Error('Not authenticated - storageState not applied')
  }
  await seedDemoData(page)
}

async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.textContent || '')
}

async function expectVisibleText(page: Page, needle: string) {
  await expect.poll(() => bodyText(page), { timeout: 10000 }).toContain(needle)
}

test.describe('Credit page content (mobile 375px)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, storageState: STATE_FILE })

  test('shows invoice ref, phone, balance, status and Encaisser button per credit', async ({ page }) => {
    test.setTimeout(60000)
    await ensureLoggedIn(page)
    await page.goto('/credits')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1500)

    await expectVisibleText(page, 'Encours total')
    await expectVisibleText(page, 'Gestion du Cr')

    for (const name of ['Awa Ouédraogo', 'Ibrahim Traoré', 'Moussa Kaboré']) {
      await expectVisibleText(page, name)
    }
    await expectVisibleText(page, '+226 70 12 34 56')
    await expectVisibleText(page, '+226 66 78 90 12')
    await expectVisibleText(page, '+226 71 22 33 44')

    const body = await bodyText(page)
    expect(body).toContain('Encaisser')
    expect(body).toMatch(/12\s?000/)
    expect(body).toMatch(/7\s?992/)
    expect(body).toContain('#FAC-0002')
    expect(body).toContain('#FAC-0004')
    expect(body).toContain('#FAC-0001')
  })
})

test.describe('Reports page content (mobile 375px)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, storageState: STATE_FILE })

  test('shows sales data in mobile card layout', async ({ page }) => {
    test.setTimeout(60000)
    await ensureLoggedIn(page)
    await page.goto('/reports')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1500)

    await expectVisibleText(page, 'Rapports')
    const body = await bodyText(page)
    expect(body).toContain('FAC-0001')
    expect(body).toContain('Awa Ouédraogo')
    expect(body).toMatch(/14\s?160/)
    expect(body).toMatch(/87\s?392/)
  })
})

test.describe('POS page (mobile 375px)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, storageState: STATE_FILE })

  test('shows products to add and fixed bottom cart button above bottom nav', async ({ page }) => {
    test.setTimeout(60000)
    await ensureLoggedIn(page)
    await page.goto('/pos')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1500)

    await expectVisibleText(page, 'Coca-Cola')
    await expectVisibleText(page, 'Stock: 100 pi')

    const productBtn = page.locator('button', { hasText: 'Coca-Cola' }).first()
    await expect(productBtn).toBeVisible()
    await productBtn.scrollIntoViewIfNeeded()
    await productBtn.click({ force: true })
    await page.waitForTimeout(800)

    const cartBtn = page.locator('button', { hasText: /Panier \(1\)/ }).first()
    await expect(cartBtn).toBeVisible()
    const box = await cartBtn.boundingBox()
    expect(box!.y + box!.height).toBeLessThan(667)
  })
})

test.describe('Credit Encaisser flow (mobile 375px)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, storageState: STATE_FILE })

  test('Encaisser button opens payment modal', async ({ page }) => {
    test.setTimeout(60000)
    await ensureLoggedIn(page)
    await page.goto('/credits')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1500)

    const encaisser = page.locator('button', { hasText: 'Encaisser' }).first()
    await expect(encaisser).toBeVisible()
    await encaisser.scrollIntoViewIfNeeded()
    await encaisser.click({ force: true })
    await page.waitForTimeout(800)
    const body = await bodyText(page)
    expect(body).toMatch(/Paiement|Montant/i)
  })
})
