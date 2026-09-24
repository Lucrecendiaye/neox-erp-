import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { seedDemoData } from './helpers'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe reports + pos', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
  await seedDemoData(page)

  await page.goto('/reports')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
  const rBody = (await page.evaluate(() => document.body.textContent || '')).slice(0, 600)
  console.log('REPORTS_BODY=' + JSON.stringify(rBody))

  await page.goto('/pos')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
  const pBody = (await page.evaluate(() => document.body.textContent || '')).slice(0, 600)
  console.log('POS_BODY=' + JSON.stringify(pBody))
  const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).slice(0, 20))
  console.log('POS_BTNS=' + JSON.stringify(btns))
  await ctx.close()
})
