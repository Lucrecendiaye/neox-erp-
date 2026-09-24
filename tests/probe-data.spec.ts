import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { seedDemoData } from './helpers'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe seeded data renders', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
  await seedDemoData(page)
  await page.goto('/credits')
  await page.waitForLoadState('load')
  await page.waitForTimeout(2000)
  const credits = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts')).default
    const rows = Array.from(document.querySelectorAll('tr')).map(tr => tr.textContent?.trim().replace(/\s+/g, ' ').slice(0, 160))
    return {
      dbCredits: await db.credits.count(),
      dbCustomers: await db.customers.count(),
      rows,
      hasEncaisser: (document.body.textContent || '').includes('Encaisser'),
      hasPhone: (document.body.textContent || '').includes('+226'),
      hasInvoice: /FAC-000[1-4]/.test(document.body.textContent || ''),
    }
  })
  console.log('DATA=' + JSON.stringify(credits))
  await ctx.close()
})
