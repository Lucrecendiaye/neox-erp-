import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('mobile POS full flow with seeded products', async ({ browser }) => {
  const state = JSON.parse(fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8'))
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(2500)

  // Seed products + shop location
  const seed = await page.evaluate(async () => {
    const db = (await import('/src/db')).default
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const bizId = useAppStore.getState().currentBusiness?.id || ''
    const now = new Date().toISOString()
    let loc = await db.locations.where('businessId').equals(bizId).first()
    if (!loc) {
      const lid = 'loc-' + Date.now()
      loc = { id: lid, businessId: bizId, name: 'Boutique principale', type: 'shop', isActive: true, createdAt: now, updatedAt: now }
      await db.locations.add(loc)
    }
    for (let i = 0; i < 6; i++) {
      const pid = 'prod-' + Date.now() + '-' + i
      await db.products.add({
        id: pid, businessId: bizId, name: `Produit Test ${i + 1}`,
        reference: `REF-${100 + i}`, barcode: `BCD${1000 + i}`,
        categoryId: undefined, unit: 'piece', sellingPrice: 1000 + i * 500,
        wholesalePrice: 900 + i * 400, purchasePrice: 500 + i * 200,
        taxRate: 0, stockAlert: 5, status: 'active', createdAt: now, updatedAt: now,
      })
      await db.productStocks.add({
        id: 'stock-' + pid, businessId: bizId, productId: pid, locationId: loc.id,
        quantity: 10 + i * 2, stockAlert: 5, stockMin: 0, stockMax: 999999, updatedAt: now,
      })
    }
    return { bizId, locationId: loc.id }
  })
  console.log('SEED=' + JSON.stringify(seed))

  await page.goto('/pos')
  await page.waitForLoadState('load')
  await page.waitForTimeout(3000)

  const addButtons = await page.getByRole('button', { name: /Ajouter/ }).count()
  await page.screenshot({ path: path.join(dir, 'shot-pos-grid.png'), fullPage: true })

  // Add first product
  const addBtn = page.getByRole('button', { name: /Ajouter/ }).first()
  await addBtn.click()
  await addBtn.click()
  await page.waitForTimeout(600)

  // Cart bar visible?
  const cartBar = await page.getByRole('button', { name: /Panier/ }).count()
  await page.screenshot({ path: path.join(dir, 'shot-pos-cartbar.png'), fullPage: true })

  // Open cart sheet
  await page.getByRole('button', { name: /Panier/ }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(dir, 'shot-pos-cartsheet.png'), fullPage: true })

  // Go to payment
  const checkout = page.getByRole('button', { name: /Passer au paiement/ })
  if (await checkout.count()) {
    await checkout.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(dir, 'shot-pos-payment.png'), fullPage: true })
    // Wave
    await page.getByRole('button', { name: /Wave/ }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(dir, 'shot-pos-payment-wave.png'), fullPage: true })
    // Credit
    await page.getByRole('button', { name: /Crédit/ }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(dir, 'shot-pos-credit.png'), fullPage: true })
    // Validate credit
    const nameInput = page.getByPlaceholder(/Nom du client/)
    await nameInput.fill('Client Test Mobile')
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(dir, 'shot-pos-credit-filled.png'), fullPage: true })
  }

  console.log('POS_FLOW=' + JSON.stringify({ addButtons, cartBar }))
  await ctx.close()
})
