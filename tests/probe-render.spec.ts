import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe rendering', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  const urls = ['/', '/credits', '/reports', '/products', '/sales']
  for (const u of urls) {
    await page.goto(u)
    await page.waitForLoadState('load')
    await page.waitForTimeout(2500)
    const info = await page.evaluate(() => ({
      url: location.pathname,
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.slice(0, 50) || 'NO-H1',
      bodyLen: document.body.innerText.length,
      hasTable: !!document.querySelector('table'),
      hasBottomNav: !!document.querySelector('.mobile-bottom-nav'),
      rowCount: document.querySelectorAll('table tbody tr').length,
      cardCount: document.querySelectorAll('.data-card, .mobile-card').length,
    }))
    console.log(JSON.stringify(info))
  }
  await ctx.close()
})
