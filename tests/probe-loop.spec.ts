import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe push loop errors', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(3000)
  const info = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts')).default
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const { supabase } = await import('/src/lib/supabase.ts')
    const { sanitizePayloadForSync } = await import('/src/lib/imageStorage.ts')
    const st = useAppStore.getState()
    const bizId = st.currentBusiness?.id || st.user?.businessId
    const now = new Date().toISOString()

    await db.products.put({ id: 'probe-loop-1', businessId: bizId, name: 'Loop Test', unit: 'piece', purchasePrice: 100, sellingPrice: 200, margin: 50, taxRate: 0, photos: [], status: 'active', createdAt: now, updatedAt: now })

    const item = (await db.products.get('probe-loop-1'))!
    const clean = await sanitizePayloadForSync(item)
    const { id, ...data } = clean
    const r = await supabase.from('products').upsert({ id, ...data }, { onConflict: 'id' })

    return {
      bizId,
      error: r.error?.message || null,
      details: r.error?.details || null,
      code: r.error?.code || null,
      payloadKeys: Object.keys(data),
      payload: data,
    }
  })
  console.log('LOOP=' + JSON.stringify(info))
  await ctx.close()
})
