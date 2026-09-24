import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe supabase state', async ({ browser }) => {
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
    const uid = st.user?.id
    const bizId = st.currentBusiness?.id || st.user?.businessId
    const profile = await supabase.from('profiles').select('*').eq('auth_user_id', uid).single()
    const biz = bizId ? await supabase.from('businesses').select('*').eq('id', bizId).single() : null
    return {
      uid,
      bizId,
      user: st.user,
      currentBusiness: st.currentBusiness,
      profile: { err: profile.error?.message || null, row: profile.data },
      biz: { err: biz?.error?.message || null, row: biz?.data },
    }
  })
  console.log('SUPA=' + JSON.stringify(info))
  await ctx.close()
})
