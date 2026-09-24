import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe upsert full row', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(3000)
  const info = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const st = useAppStore.getState()
    const bizId = st.currentBusiness?.id || st.user?.businessId
    const rows = [
      { id: 'probe-full-1', businessId: bizId, name: 'Coca-Cola 33cl', barcode: '6111252120200', unit: 'piece', purchasePrice: 250, sellingPrice: 500, wholesalePrice: 400, priceDozen: 4800, margin: 50, taxRate: 18, stockAlert: 20, stockMin: 10, status: 'active', categoryId: 'seed-cat-1', photos: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'probe-full-2', businessId: bizId, name: 'Cat test', createdAt: new Date().toISOString() },
      { id: 'probe-full-3', businessId: bizId, name: 'Loc test', type: 'boutique', isActive: true, createdAt: new Date().toISOString() },
    ]
    const r1 = await supabase.from('products').upsert(rows[0], { onConflict: 'id' })
    const r2 = await supabase.from('categories').upsert(rows[1], { onConflict: 'id' })
    const r3 = await supabase.from('locations').upsert(rows[2], { onConflict: 'id' })
    return {
      products: r1.error?.message || null,
      categories: r2.error?.message || null,
      locations: r3.error?.message || null,
    }
  })
  console.log('FULL=' + JSON.stringify(info))
  await ctx.close()
})
