import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

async function shot(browser: any, url: string, name: string, w: number, h: number) {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, storageState: JSON.parse(state), hasTouch: w < 768, isMobile: w < 768 })
  const page = await ctx.newPage()
  await page.goto(url)
  await page.waitForLoadState('load')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(dir, `../screenshots/${name}.png`), fullPage: false })
  await ctx.close()
}

test('screenshots', async ({ browser }) => {
  await shot(browser, '/', 'mob-dashboard', 375, 667)
  await shot(browser, '/pos', 'mob-pos', 375, 667)
  await shot(browser, '/credits', 'mob-credit', 375, 667)
  await shot(browser, '/reports', 'mob-reports', 375, 667)
  await shot(browser, '/products', 'mob-products', 375, 667)
  await shot(browser, '/sales', 'mob-sales', 375, 667)
  await shot(browser, '/customers', 'mob-customers', 375, 667)
  await shot(browser, '/suppliers', 'mob-suppliers', 375, 667)
  await shot(browser, '/depots', 'mob-depots', 375, 667)
  await shot(browser, '/settings', 'mob-settings', 375, 667)
})
