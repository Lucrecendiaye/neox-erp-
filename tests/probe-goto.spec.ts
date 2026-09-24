import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe goto credits', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  const resp = await page.goto('/credits')
  console.log('STATUS:', resp?.status(), 'FINAL URL:', page.url())
  await page.waitForTimeout(3000)
  console.log('AFTER WAIT URL:', page.url())
  console.log('H1:', await page.evaluate(() => document.querySelector('h1')?.textContent))
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).slice(0, 10).map(a => a.getAttribute('href')))
  console.log('LINKS:', JSON.stringify(links))
  await ctx.close()
})
