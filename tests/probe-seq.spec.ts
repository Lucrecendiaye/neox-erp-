import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe sequential nav', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(3000)
  console.log('STEP1 URL:', page.url())
  await page.goto('/credits')
  await page.waitForTimeout(3000)
  console.log('STEP2 URL:', page.url(), 'H1:', await page.evaluate(() => document.querySelector('h1')?.textContent))
  await page.goto('/reports')
  await page.waitForTimeout(3000)
  console.log('STEP3 URL:', page.url(), 'H1:', await page.evaluate(() => document.querySelector('h1')?.textContent))
  await ctx.close()
})
