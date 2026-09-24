import { test } from '@playwright/test'

test('probe products page authenticated', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

  const email = `probe-${Date.now()}@example.com`
  await page.goto('http://localhost:4173/login', { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  if (page.url().includes('/login')) {
    const regBtn = page.locator('button', { hasText: 'un compte' })
    if (await regBtn.isVisible().catch(() => false)) { await regBtn.click(); await page.waitForURL(/\/register/) }
  }
  if (page.url().includes('/register')) {
    await page.getByPlaceholder('Votre nom').fill('Probe User')
    await page.getByPlaceholder('email@exemple.com').fill(email)
    await page.getByPlaceholder('+226 XX XX XX').fill('+22670000000')
    const pwds = page.locator('input[type="password"]')
    await pwds.nth(0).fill('test123')
    await pwds.nth(1).fill('test123')
    await page.locator('button', { hasText: 'mon compte' }).click()
    await page.waitForTimeout(6000)
    await page.waitForURL(/\/login$/, { timeout: 20000 }).catch(() => {})
  }
  for (let i = 0; i < 4; i++) {
    if (!page.url().includes('/login')) break
    await page.getByPlaceholder('exemple@email.com').fill(email)
    await page.locator('input[type="password"]').fill('test123')
    await page.locator('button', { hasText: 'Se connecter' }).click()
    for (let k = 0; k < 10; k++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
  }
  await page.waitForTimeout(1500)
  console.log('LOGGED URL: ' + page.url())

  await page.goto('http://localhost:4173/products', { waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)
  console.log('PRODUCTS URL: ' + page.url())
  const body = (await page.locator('body').innerText()).slice(0, 600).replace(/\n/g, ' | ')
  console.log('BODY: ' + body)
  const title = await page.title().catch(() => 'no-title')
  console.log('TITLE: ' + title)
  console.log('ERRORS: ' + JSON.stringify(errors, null, 2))
})
