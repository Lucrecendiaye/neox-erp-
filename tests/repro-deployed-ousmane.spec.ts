import { test } from '@playwright/test'

test('deployed OLD app: ousmane login by email', async ({ page }) => {
  await page.goto('https://neox-erp.vercel.app/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(15000)
  const input = page.getByPlaceholder('email@exemple.com').or(page.locator('input[type="text"]').first()).or(page.locator('input').first())
  await input.fill('ousmane@shop.com')
  const pwd = page.locator('input[type="password"]').first()
  await pwd.fill('Ousmane123!')
  const btn = page.getByRole('button', { name: 'Se connecter' })
  await btn.click()
  await page.waitForTimeout(15000)
  console.log('URL:', page.url())
  const body = await page.evaluate(() => document.body.innerText.slice(0, 300))
  console.log('BODY:', JSON.stringify(body))
})