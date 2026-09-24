import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('mobile POS dom probe', async ({ browser }) => {
  const state = JSON.parse(fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8'))
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state })
  const page = await ctx.newPage()
  await page.goto('/pos')
  await page.waitForLoadState('load')
  await page.waitForTimeout(3500)
  const info = await page.evaluate(async () => {
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const db = (await import('/src/db')).default
    const bizId = useAppStore.getState().currentBusiness?.id
    const products = await db.products.where('businessId').equals(bizId).toArray()
    return {
      bizId,
      productCount: products.length,
      sample: products.slice(0, 3).map(p => p.name),
      bodyText: document.body.innerText.slice(0, 300),
    }
  })
  console.log('DOM_PROBE=' + JSON.stringify(info))
  await ctx.close()
})
