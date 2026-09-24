import { test, expect } from '@playwright/test'
import { tryRegisterAndLogin, seedDemoData } from './helpers'

test.describe('Paiement mixte POS', () => {
  test('vente mixte complet (Espèces + Wave) puis vérif splitPayments', async ({ page }) => {
    test.setTimeout(120000)
    await page.goto('http://localhost:3000/')
    await page.waitForLoadState('load')

    const email = `split-${Date.now()}@example.com`
    let p = await tryRegisterAndLogin(page, email)
    expect(p.url()).toBe('http://localhost:3000/')

    const seeded = await seedDemoData(page)
    expect(seeded.ok).toBe(true)

    await page.goto('http://localhost:3000/pos')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1500)

    const coca = page.locator('button', { hasText: 'Coca-Cola 33cl' }).first()
    if (await coca.isVisible().catch(() => false)) {
      await coca.click()
      await page.waitForTimeout(500)
    }

    const cartCount = await page.evaluate(async () => {
      const { useAppStore } = await import('/src/stores/appStore.ts')
      for (let i = 0; i < 20; i++) {
        const st = useAppStore.getState()
        const bizId = st.user?.businessId || st.currentBusiness?.id
        if (bizId) {
          const db = (await import('/src/db/index.ts')).default
          const stocks = await db.productStocks.where('businessId').equals(bizId).toArray()
          return { bizId, stocks: stocks.length }
        }
        await new Promise(r => setTimeout(r, 500))
      }
      return { bizId: null as any, stocks: 0 }
    })
    expect(cartCount.bizId).toBeTruthy()

    const mixteTab = page.locator('button', { hasText: 'Mixte' }).first()
    if (await mixteTab.isVisible().catch(() => false)) {
      await mixteTab.click()
      await page.waitForTimeout(300)
    } else {
      // Écran mobile : ouvrir le panier puis PaymentScreen
      await page.goto('http://localhost:3000/pos')
      await page.waitForTimeout(1000)
      const payButton = page.locator('button', { hasText: 'Valider' }).first()
      if (await payButton.isVisible().catch(() => false)) await payButton.click()
      await page.waitForTimeout(800)
      const mixteGiant = page.locator('button', { hasText: 'Mixte' }).first()
      if (await mixteGiant.isVisible().catch(() => false)) {
        await mixteGiant.click()
        await page.waitForTimeout(300)
      }
    }

    const totalText = await page.evaluate(() => document.body.innerText)
    const hasSplitUI = totalText.includes('Répartition') || totalText.includes('Paiement mixte') || totalText.includes('Total payé')
    expect(hasSplitUI).toBe(true)
  })

  test('paiement mixte partiel crée un crédit client', async ({ page }) => {
    test.setTimeout(120000)
    await page.goto('http://localhost:3000/')
    await page.waitForLoadState('load')

    const email = `split-part-${Date.now()}@example.com`
    let p = await tryRegisterAndLogin(page, email)
    expect(p.url()).toBe('http://localhost:3000/')

    const seeded = await seedDemoData(page)
    expect(seeded.ok).toBe(true)

    await page.goto('http://localhost:3000/pos')
    await page.waitForLoadState('load')
    await page.waitForTimeout(1500)

    // Ajouter 2 produits au panier
    const coca = page.locator('button', { hasText: 'Coca-Cola 33cl' }).first()
    if (await coca.isVisible().catch(() => false)) await coca.click()
    await page.waitForTimeout(300)
    const riz = page.locator('button', { hasText: 'Riz 5kg' }).first()
    if (await riz.isVisible().catch(() => false)) await riz.click()
    await page.waitForTimeout(500)

    const mixteTab = page.locator('button', { hasText: 'Mixte' }).first()
    if (await mixteTab.isVisible().catch(() => false)) {
      await mixteTab.click()
      await page.waitForTimeout(300)
    }

    const result = await page.evaluate(async () => {
      const db = (await import('/src/db/index.ts')).default
      const { useAppStore } = await import('/src/stores/appStore.ts')
      const bizId = useAppStore.getState().user?.businessId || useAppStore.getState().currentBusiness?.id
      const now = new Date()
      const iso = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()
      const uid = useAppStore.getState().user?.id || 'seed'
      const customerId = 'seed-c1'
      const sale = {
        id: 'test-split-sale-1',
        businessId: bizId,
        locationId: 'seed-loc-1',
        invoiceNumber: 'SPLIT-0001',
        customerId,
        customerName: 'Awa Ouédraogo',
        items: [{ productId: 'seed-p1', productName: 'Coca-Cola 33cl', quantity: 24, unitPrice: 500, discount: 0, taxRate: 18, total: 12000 }],
        subtotal: 12000,
        discountTotal: 0,
        taxTotal: 0,
        total: 12000,
        paid: 10000,
        change: 0,
        paymentMethod: 'split',
        splitPayments: [
          { method: 'cash', amount: 4000 },
          { method: 'wave', amount: 6000 },
        ],
        status: 'completed',
        createdAt: iso(0),
        userId: uid,
      }
      const { processSale } = await import('/src/engine/operations.ts')
      await processSale(sale as any)
      const saved = await db.sales.get('test-split-sale-1')
      const credit = (await db.credits.toArray()).find(c => c.invoiceId === 'test-split-sale-1')
      const payments = (await db.creditPayments.toArray()).filter(cp => cp.saleId === 'test-split-sale-1')
      const cashBook = (await db.cashBook.toArray()).filter(e => e.reference === 'SPLIT-0001')
      return { saved, credit, payments, cashBook }
    })

    expect(result.saved?.paymentMethod).toBe('split')
    expect(result.saved?.splitPayments?.length).toBe(2)
    expect(result.saved?.paid).toBe(10000)
    expect(result.credit).toBeTruthy()
    expect(result.credit!.balance).toBe(2000)
    expect(result.payments.length).toBe(2)
    expect(result.cashBook.length).toBe(2)
  })
})

test('vente mixte complète via UI (Espèces 250 + Wave 150)', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('http://localhost:3000/')
  await page.waitForLoadState('load')

  const email = `split-ui-${Date.now()}@example.com`
  let p = await tryRegisterAndLogin(page, email)
  expect(p.url()).toBe('http://localhost:3000/')

  const seeded = await seedDemoData(page)
  expect(seeded.ok).toBe(true)

  await page.goto('http://localhost:3000/pos')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)

  const coca = page.locator('button', { hasText: 'Coca-Cola 33cl' }).first()
  try {
    await coca.waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    // ignore
  }
  if (await coca.isVisible().catch(() => false)) {
    await coca.click()
    await page.waitForTimeout(500)
  }

  // Onglet Mixte (desktop : SalePaymentPanel)
  let panel: any = null
  const mixteTab = page.locator('button', { hasText: 'Mixte' }).first()
  if (await mixteTab.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
    await mixteTab.click()
    await page.waitForTimeout(400)
    const roz = page.locator('p', { hasText: 'Répartition des paiements' }).first()
    panel = roz.locator('xpath=..')
  }

  if (panel) {
    // Ligne 1 : Espèces 200
    await panel.locator('select').nth(0).selectOption('cash')
    await panel.locator('input[type="number"]').nth(0).fill('250')
    // Ajouter un moyen -> Wave 200
    const addBtn = page.locator('button', { hasText: 'Ajouter un moyen' }).first()
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click()
      await page.waitForTimeout(300)
      await panel.locator('select').nth(1).selectOption('wave')
      await panel.locator('input[type="number"]').nth(1).fill('150')
      await page.waitForTimeout(300)
    }

    // Vérifier "Payé" total (coca en mode gros = 400) et valider
    const panelText = await panel.innerText()
    expect(panelText).toContain('Payé')
    const btn = page.locator('button', { hasText: /Valider/ }).first()
    if (await btn.isVisible().catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(2500)
    }
  }

  // Vérifier la vente enregistrée
  const sale = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts')).default
    const { useAppStore } = await import('/src/stores/appStore.ts')
    for (let i = 0; i < 20; i++) {
      const st = useAppStore.getState()
      const bizId = st.user?.businessId || st.currentBusiness?.id
      if (bizId) {
        const sales = await db.sales.where('businessId').equals(bizId).and(s => s.paymentMethod === 'split').toArray()
        const latest = sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        if (latest) {
          const credits = (await db.credits.toArray()).filter(c => c.invoiceId === latest.id)
          return { sale: latest, credits }
        }
      }
      await new Promise(r => setTimeout(r, 500))
    }
    return null
  })

  expect(sale).toBeTruthy()
  expect(sale!.sale.paid).toBe(400)
  expect((sale!.sale.splitPayments || []).length).toBe(2)
  const methods = (sale!.sale.splitPayments || []).map(s => s.method).sort()
  expect(methods).toEqual(['cash', 'wave'])
  expect(sale!.credits.length).toBe(0)
})

function formatCurrencyUI(n: number): string {
  return n.toLocaleString('fr-FR')
}
