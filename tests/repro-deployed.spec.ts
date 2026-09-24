import { test, Page } from '@playwright/test'

const DEPLOYED = 'https://neox-erp.vercel.app'

async function uiLogin(page: Page, identifier: string, password: string) {
  await page.goto(DEPLOYED + '/login')
  await page.waitForTimeout(2500)
  const id = page.getByPlaceholder('exemple@email.com')
  if (!(await id.isVisible().catch(() => false))) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 200))
    console.log('BODY BEFORE LOGIN:', JSON.stringify(body))
    return
  }
  await id.fill(identifier)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.waitForTimeout(1200)
  const pwd = page.getByPlaceholder('••••••••').first()
  if (await pwd.isVisible().catch(() => false)) {
    await pwd.fill(password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
  }
}

test('deployed: ousmane login by email', async ({ page }) => {
  await uiLogin(page, 'ousmane@shop.com', 'Ousmane123!')
  await page.waitForTimeout(12000)
  console.log('URL:', page.url())
  const body = await page.evaluate(() => document.body.innerText.slice(0, 250))
  console.log('BODY:', JSON.stringify(body))
})

test('deployed: member created via admin_create_user login by loginId', async ({ page }) => {
  await uiLogin(page, 'probeid-1786570519784', 'Testpass123')
  await page.waitForTimeout(12000)
  console.log('URL:', page.url())
  const body = await page.evaluate(() => document.body.innerText.slice(0, 250))
  console.log('BODY:', JSON.stringify(body))
})