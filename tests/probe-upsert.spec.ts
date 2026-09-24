import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe upsert error', async ({ browser }) => {
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
    const testRow = {
      id: 'probe-upsert-test-' + Date.now(),
      businessId: bizId,
      name: 'Test Probe',
      unit: 'piece',
      purchasePrice: 100,
      sellingPrice: 200,
      margin: 50,
      taxRate: 0,
      photos: [],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const r = await supabase.from('products').upsert(testRow, { onConflict: 'id' })
    const list = await supabase.from('products').select('id').limit(5)
    return { upsertErr: r.error?.message || null, upsertDetails: r.error?.details || null, hint: r.error?.hint || null, count: list.data?.length, listErr: list.error?.message || null }
  })
  console.log('UPSERT=' + JSON.stringify(info))
  await ctx.close()
})
