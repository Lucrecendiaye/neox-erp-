import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe push errors', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(3000)
  const info = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts')).default
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const st = useAppStore.getState()
    const bizId = st.currentBusiness?.id || st.user?.businessId
    const now = new Date().toISOString()

    await db.products.put({ id: 'probe-push-1', businessId: bizId, name: 'Push Test', unit: 'piece', purchasePrice: 100, sellingPrice: 200, margin: 50, taxRate: 0, photos: [], status: 'active', createdAt: now, updatedAt: now })

    const { supabase } = await import('/src/lib/supabase.ts')
    const { sanitizePayloadForSync } = await import('/src/lib/imageStorage.ts')
    const item = (await db.products.get('probe-push-1'))!
    const clean = await sanitizePayloadForSync(item)
    const { id, ...data } = clean
    const r = await supabase.from('products').upsert({ id, ...data }, { onConflict: 'id' })
    return {
      bizId,
      directErr: r.error?.message || null,
      row: { id, name: (data as any).name, businessId: (data as any).businessId },
    }
  })
  console.log('PUSH=' + JSON.stringify(info))
  await ctx.close()
})
