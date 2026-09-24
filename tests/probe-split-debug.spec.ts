import { test } from '@playwright/test'
import { tryRegisterAndLogin, seedDemoData } from './helpers'

test('debug shopStocks on /pos', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('http://localhost:3000/')
  await page.waitForLoadState('load')
  const email = `dbg-${Date.now()}@example.com`
  await tryRegisterAndLogin(page, email)
  const seeded = await seedDemoData(page)
  console.log('SEEDED', JSON.stringify(seeded))

  await page.goto('http://localhost:3000/pos')
  await page.waitForLoadState('load')
  await page.waitForTimeout(2000)

  const info = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts')).default
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const st = useAppStore.getState()
    const bizId = st.user?.businessId || st.currentBusiness?.id
    const locations = await db.locations.where('businessId').equals(bizId).toArray()
    const stocks = await db.productStocks.where('businessId').equals(bizId).toArray()
    const products = await db.products.where('businessId').equals(bizId).toArray()
    return {
      userBizId: st.user?.businessId,
      currentBizId: st.currentBusiness?.id,
      locations: locations.map(l => ({ id: l.id, type: l.type, name: l.name })),
      stocks: stocks.map(s => ({ id: s.id, productId: s.productId, locationId: s.locationId, qty: s.quantity })),
      products: products.length,
    }
  })
  console.log('INFO', JSON.stringify(info, null, 2))
})
