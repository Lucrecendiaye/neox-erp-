import { test, Page } from '@playwright/test'

async function uiLogin(page: Page, identifier: string, password: string) {
  await page.goto('/login')
  await page.waitForTimeout(1500)
  await page.getByPlaceholder('exemple@email.com').fill(identifier)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.waitForTimeout(1000)
  const pwd = page.getByPlaceholder('••••••••').first()
  if (await pwd.isVisible().catch(() => false)) {
    await pwd.fill(password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
  }
}

test('register flow: create account then login', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  const suffix = Date.now().toString().slice(-7)
  const email = 'reg-' + suffix + '@neoxerp.app'
  const loginId = 'reglogin' + suffix
  const password = 'RegPass99!'

  await page.goto('/register')
  await page.waitForTimeout(2000)
  await page.getByPlaceholder('Votre nom').fill('Reg Test ' + suffix)
  await page.getByPlaceholder('email@exemple.com').fill(email)
  await page.getByPlaceholder('ex: user@shop ou mon-id').fill(loginId)
  await page.getByPlaceholder('+226 XX XX XX').fill('+22671111111')
  const pwds = page.locator('input[type="password"]')
  await pwds.nth(0).fill(password)
  await pwds.nth(1).fill(password)
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await page.waitForTimeout(8000)
  console.log('AFTER REGISTER URL:', page.url())
  const regBody = await page.evaluate(() => document.body.innerText.slice(0, 250))
  console.log('AFTER REGISTER BODY:', JSON.stringify(regBody))

  if (page.url().includes('/login')) {
    await uiLogin(page, email, password)
    await page.waitForTimeout(9000)
    console.log('AFTER LOGIN URL:', page.url())
    const body = await page.evaluate(() => document.body.innerText.slice(0, 250))
    console.log('AFTER LOGIN BODY:', JSON.stringify(body))
    console.log('ERRORS:', JSON.stringify(errors))
  }
})