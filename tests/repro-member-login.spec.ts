import { test, Page } from '@playwright/test'

async function uiLogin(page: Page, identifier: string, password: string) {
  await page.goto('/login')
  await page.waitForTimeout(1500)
  await page.getByPlaceholder('exemple@email.com').fill(identifier)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.waitForTimeout(800)
  await page.getByPlaceholder('••••••••').first().fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForTimeout(8000)
  const url = page.url()
  const body = await page.evaluate(() => document.body.innerText.slice(0, 200))
  return { url, body }
}

test('login new member created via admin_create_user (loginId)', async ({ page }) => {
  const { url, body } = await uiLogin(page, 'probeid-1786570519784', 'Testpass123')
  console.log('LOGIN BY LOGINID URL:', url)
  console.log('LOGIN BY LOGINID BODY:', JSON.stringify(body))
})

test('login that member by email', async ({ page }) => {
  const { url, body } = await uiLogin(page, 'probe-1786570519784@neoxerp.app', 'Testpass123')
  console.log('LOGIN BY EMAIL URL:', url)
  console.log('LOGIN BY EMAIL BODY:', JSON.stringify(body))
})