import type { Page } from '@playwright/test'

export const TEST_PASSWORD = 'test123'
export const TEST_NAME = 'Mobile Test User'

export async function tryRegisterAndLogin(page: Page, email: string) {
  await page.goto('http://localhost:3000/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1200)

  if (page.url().includes('/login')) {
    const registerLink = page.locator('button', { hasText: 'un compte' })
    if (await registerLink.isVisible().catch(() => false)) {
      await registerLink.click()
      await page.waitForURL(/\/register/)
    }
  }

  if (page.url().includes('/register')) {
    await page.getByPlaceholder('Votre nom').fill(TEST_NAME)
    await page.getByPlaceholder('email@exemple.com').fill(email)
    await page.getByPlaceholder('+226 XX XX XX').fill('+22670000000')
    const loginIdField = page.locator('input[placeholder="ex: user@shop ou mon-id"]')
    if (await loginIdField.isVisible().catch(() => false)) {
      await loginIdField.fill(email.replace(/@.*/, `-${Date.now()}`))
    }
    const pwdFields = page.locator('input[type="password"]')
    await pwdFields.nth(0).fill(TEST_PASSWORD)
    await pwdFields.nth(1).fill(TEST_PASSWORD)
    await page.locator('button', { hasText: 'mon compte' }).click()
    await page.waitForTimeout(6000)
    await page.waitForURL(/\/login$/, { timeout: 20000 }).catch(() => {})
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    if (!page.url().includes('/login')) break
    await page.getByPlaceholder('exemple@email.com').fill(email)
    await page.locator('button', { hasText: 'Continuer' }).click()
    await page.waitForTimeout(800)
    const pwdField = page.locator('input[type="password"]')
    await pwdField.first().fill(TEST_PASSWORD)
    await page.locator('button', { hasText: 'Se connecter' }).click()
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(2000)
      if (!page.url().includes('/login') && !page.url().includes('/register')) break
    }
  }

  await page.waitForLoadState('load')
  await page.waitForTimeout(1000)
  return page
}

export async function seedDemoData(page: Page): Promise<{ ok: boolean; reason?: string; counts?: Record<string, number> }> {
  const result = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts')).default
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const bizId = useAppStore.getState().user?.businessId || useAppStore.getState().currentBusiness?.id
    if (!bizId) return { ok: false as const, reason: 'no businessId' }

    const now = new Date()
    const iso = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()
    const uid = useAppStore.getState().user?.id || 'seed'

    const catId = 'seed-cat-1'
    await db.categories.bulkPut([{ id: catId, businessId: bizId, name: 'Boissons', createdAt: iso(30) }])

    const products = [
      { id: 'seed-p1', name: 'Coca-Cola 33cl', barcode: '6111252120200', unit: 'piece' as const, purchasePrice: 250, sellingPrice: 500, wholesalePrice: 400, priceDozen: 4800, margin: 50, taxRate: 18, stockAlert: 20, stockMin: 10, status: 'active' as const, categoryId: catId, photos: [] },
      { id: 'seed-p2', name: 'Eau Minérale 1.5L', barcode: '6111252120300', unit: 'piece' as const, purchasePrice: 150, sellingPrice: 300, wholesalePrice: 250, priceDozen: 3000, margin: 50, taxRate: 18, stockAlert: 30, stockMin: 15, status: 'active' as const, categoryId: catId, photos: [] },
      { id: 'seed-p3', name: 'Riz 5kg', barcode: '6111252120400', unit: 'piece' as const, purchasePrice: 2500, sellingPrice: 3500, wholesalePrice: 3200, margin: 29, taxRate: 0, stockAlert: 10, stockMin: 5, status: 'active' as const, photos: [] },
      { id: 'seed-p4', name: 'Savon Parfumé 200g', barcode: '6111252120500', unit: 'piece' as const, purchasePrice: 400, sellingPrice: 600, wholesalePrice: 500, margin: 33, taxRate: 18, stockAlert: 15, stockMin: 5, status: 'active' as const, photos: [] },
      { id: 'seed-p5', name: 'Huile Végétale 1L', barcode: '6111252120600', unit: 'piece' as const, purchasePrice: 900, sellingPrice: 1200, wholesalePrice: 1050, margin: 25, taxRate: 18, stockAlert: 12, stockMin: 6, status: 'active' as const, photos: [] },
    ]
    await db.products.bulkPut(products.map(p => ({ ...p, businessId: bizId, createdAt: iso(30), updatedAt: iso(2) })))

    const customers = [
      { id: 'seed-c1', name: 'Awa Ouédraogo', phone: '+226 70 12 34 56', creditLimit: 100000, currentBalance: 45000 },
      { id: 'seed-c2', name: 'Ibrahim Traoré', phone: '+226 66 78 90 12', creditLimit: 50000, currentBalance: 12000 },
      { id: 'seed-c3', name: 'Fatou Compaoré', phone: '+226 55 43 21 09', creditLimit: 75000, currentBalance: 0 },
      { id: 'seed-c4', name: 'Moussa Kaboré', phone: '+226 71 22 33 44', creditLimit: 20000, currentBalance: 8000 },
    ]
    await db.customers.bulkPut(customers.map(c => ({ ...c, businessId: bizId, createdAt: iso(25), updatedAt: iso(1) })))

    const suppliers = [
      { id: 'seed-s1', name: 'SODIBO', phone: '+226 25 30 40 50' },
      { id: 'seed-s2', name: 'BRAKINA', phone: '+226 25 36 12 34' },
    ]
    await db.suppliers.bulkPut(suppliers.map(s => ({ ...s, businessId: bizId, createdAt: iso(40), updatedAt: iso(10) })))

    const sales = [
      { id: 'seed-sale-1', invoiceNumber: 'FAC-0001', customerId: 'seed-c1', customerName: 'Awa Ouédraogo', items: [{ productId: 'seed-p1', productName: 'Coca-Cola 33cl', quantity: 24, unitPrice: 500, discount: 0, taxRate: 18, total: 12000 }], subtotal: 12000, discountTotal: 0, taxTotal: 2160, total: 14160, paid: 14160, change: 0, paymentMethod: 'cash', status: 'completed', paymentStatus: 'paid' },
      { id: 'seed-sale-2', invoiceNumber: 'FAC-0002', customerId: 'seed-c2', customerName: 'Ibrahim Traoré', items: [{ productId: 'seed-p3', productName: 'Riz 5kg', quantity: 10, unitPrice: 3500, discount: 0, taxRate: 0, total: 35000 }], subtotal: 35000, discountTotal: 0, taxTotal: 0, total: 35000, paid: 23000, change: 0, paymentMethod: 'credit', status: 'completed', paymentStatus: 'partial' },
      { id: 'seed-sale-3', invoiceNumber: 'FAC-0003', customerId: 'seed-c1', customerName: 'Awa Ouédraogo', items: [{ productId: 'seed-p5', productName: 'Huile Végétale 1L', quantity: 12, unitPrice: 1200, discount: 0, taxRate: 18, total: 14400 }, { productId: 'seed-p4', productName: 'Savon Parfumé 200g', quantity: 6, unitPrice: 600, discount: 0, taxRate: 18, total: 3600 }], subtotal: 18000, discountTotal: 0, taxTotal: 3240, total: 21240, paid: 21240, change: 0, paymentMethod: 'cash', status: 'completed', paymentStatus: 'paid' },
      { id: 'seed-sale-4', invoiceNumber: 'FAC-0004', customerId: 'seed-c4', customerName: 'Moussa Kaboré', items: [{ productId: 'seed-p2', productName: 'Eau Minérale 1.5L', quantity: 48, unitPrice: 300, discount: 0, taxRate: 18, total: 14400 }], subtotal: 14400, discountTotal: 0, taxTotal: 2592, total: 16992, paid: 9000, change: 0, paymentMethod: 'credit', status: 'completed', paymentStatus: 'partial' },
    ]
    await db.sales.bulkPut(sales.map(s => ({ ...s, businessId: bizId, locationId: 'seed-loc-1', createdAt: iso(1), userId: uid })))

    const credits = [
      { id: 'seed-credit-1', customerId: 'seed-c2', customerName: 'Ibrahim Traoré', invoiceId: 'seed-sale-2', amount: 12000, paid: 0, balance: 12000, dueDate: iso(-9), status: 'active' as const },
      { id: 'seed-credit-2', customerId: 'seed-c4', customerName: 'Moussa Kaboré', invoiceId: 'seed-sale-4', amount: 7992, paid: 2000, balance: 5992, dueDate: iso(-5), status: 'active' as const },
      { id: 'seed-credit-3', customerId: 'seed-c1', customerName: 'Awa Ouédraogo', invoiceId: 'seed-sale-1', amount: 14160, paid: 14160, balance: 0, dueDate: iso(-20), status: 'paid' as const },
    ]
    await db.credits.bulkPut(credits.map(c => ({ ...c, businessId: bizId, reminderSent: [], createdAt: iso(3) })))

    await db.creditPayments.bulkPut([
      { id: 'seed-cp-1', businessId: bizId, creditId: 'seed-credit-2', saleId: 'seed-sale-4', customerId: 'seed-c4', amount: 2000, method: 'cash', date: iso(3), userId: uid, createdAt: iso(3) },
    ])

    const seedLocations = [
      { id: 'seed-loc-1', businessId: bizId, name: 'Boutique Principale', type: 'shop' as const, isActive: true, createdAt: iso(30), updatedAt: iso(30) },
    ]
    await db.locations.bulkPut(seedLocations)

    const shops = await db.locations.where('businessId').equals(bizId).filter(l => l.type === 'shop').toArray()
    const shopLoc = shops[0] || seedLocations[0]
    await db.productStocks.bulkPut([
      { id: 'seed-stock-1', businessId: bizId, productId: 'seed-p1', locationId: shopLoc.id, quantity: 100, stockAlert: 20, stockMin: 10, stockMax: 500, updatedAt: iso(2) },
      { id: 'seed-stock-2', businessId: bizId, productId: 'seed-p2', locationId: shopLoc.id, quantity: 200, stockAlert: 30, stockMin: 15, stockMax: 800, updatedAt: iso(2) },
      { id: 'seed-stock-3', businessId: bizId, productId: 'seed-p3', locationId: shopLoc.id, quantity: 50, stockAlert: 10, stockMin: 5, stockMax: 300, updatedAt: iso(2) },
      { id: 'seed-stock-4', businessId: bizId, productId: 'seed-p4', locationId: shopLoc.id, quantity: 80, stockAlert: 15, stockMin: 5, stockMax: 400, updatedAt: iso(2) },
      { id: 'seed-stock-5', businessId: bizId, productId: 'seed-p5', locationId: shopLoc.id, quantity: 40, stockAlert: 12, stockMin: 6, stockMax: 250, updatedAt: iso(2) },
    ])

    return {
      ok: true,
      counts: {
        products: products.length,
        customers: customers.length,
        sales: sales.length,
        credits: credits.length,
        suppliers: suppliers.length,
      },
    }
  })
  return result as { ok: boolean; reason?: string; counts?: Record<string, number> }
}
