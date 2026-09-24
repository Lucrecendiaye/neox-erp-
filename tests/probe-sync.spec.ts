import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe sync debug', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(4000)
  const info = await page.evaluate(async () => {
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const { supabase } = await import('/src/lib/supabase.ts')
    const st = useAppStore.getState()
    const bizId = st.currentBusiness?.id || st.user?.businessId
    let cloud = { count: -1, err: '' }
    if (bizId) {
      const r = await supabase.from('credits').select('id', { count: 'exact', head: true }).eq('businessId', bizId)
      cloud = { count: r.count ?? -1, err: r.error?.message || '' }
    }
    const db = (await import('/src/db/index.ts')).default
    return {
      bizId,
      user: !!st.user,
      cloud,
      dbCredits: await db.credits.count(),
      fingerprints: JSON.parse(localStorage.getItem('neox-synced-fingerprints') || '{}'),
      lastSync: JSON.parse(localStorage.getItem('neox-synced-fingerprints') || '{}'),
    }
  })
  console.log('DBG=' + JSON.stringify(info))
  await ctx.close()
})
