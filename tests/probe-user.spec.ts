import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe user state', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(3000)
  const info = await page.evaluate(async () => {
    const ls = Object.keys(localStorage)
    const authKeys = ls.filter(k => k.includes('sb-'))
    const { useAppStore } = await import('/src/stores/appStore.ts')
    return {
      lsKeys: ls,
      authKeys: authKeys.map(k => ({ k, v: (localStorage.getItem(k) || '').slice(0, 30) })),
      user: useAppStore.getState().user,
      session: !!useAppStore.getState().session,
      initialized: useAppStore.getState().initialized,
    }
  })
  console.log('INFO=' + JSON.stringify(info, null, 1))
  await ctx.close()
})
