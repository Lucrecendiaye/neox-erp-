import { test } from '@playwright/test'

test('inspect deployed app login page', async ({ page }) => {
  await page.goto('https://neox-erp.vercel.app/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(20000)
  const url = page.url()
  const title = await page.title().catch(() => '')
  const body = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 500) : 'NO BODY')
  const html = await page.evaluate(() => document.body ? document.body.innerHTML.slice(0, 800) : '')
  console.log('URL:', url)
  console.log('TITLE:', title)
  console.log('BODY:', JSON.stringify(body))
  console.log('HTML:', JSON.stringify(html))
  await page.screenshot({ path: 'screenshots/deployed-login.png', fullPage: false })
})