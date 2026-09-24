import { test, Page } from '@playwright/test'

async function uiLogin(page: Page, identifier: string, password: string) {
  await page.goto('/login')
  await page.waitForTimeout(2000)
  await page.getByPlaceholder('exemple@email.com').fill(identifier)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.waitForTimeout(1000)
  const pwd = page.getByPlaceholder('••••••••').first()
  if (await pwd.isVisible().catch(() => false)) {
    await pwd.fill(password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.waitForTimeout(9000)
  }
  const url = page.url()
  const body = await page.evaluate(() => document.body.innerText.slice(0, 250))
  return { url, body }
}

test('ousmane login by email', async ({ page }) => {
  const { url, body } = await uiLogin(page, 'ousmane@shop.com', 'Ousmane123!')
  console.log('URL:', url)
  console.log('BODY:', JSON.stringify(body))
})