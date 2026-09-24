import { chromium } from '@playwright/test'

const SITE = 'https://neox-erp-alpha.vercel.app'
const ADMIN_ID = process.argv[2]
const ADMIN_PWD = process.argv[3]

async function uiLogin(page, identifier, password) {
  await page.goto(SITE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(14000)
  await page.locator('input').first().fill(identifier)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.waitForTimeout(1500)
  await page.locator('input[type="password"]').first().fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

const browser = await chromium.launch()
const logs = []
const page = await browser.newPage()
page.on('console', m => { if (m.type() === 'error') logs.push('CONSOLE: ' + m.text().slice(0, 400)) })
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message.slice(0, 400)))

try {
  // 1) admin login
  await uiLogin(page, ADMIN_ID, ADMIN_PWD)
  await page.waitForTimeout(12000)
  console.log('ADMIN URL:', page.url())
  if (page.url().includes('/login')) { console.log('ADMIN LOGIN FAILED'); await browser.close(); process.exit(0) }

  // 2) go to users page
  await page.goto(SITE + '/users', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(6000)
  const btn = page.getByRole('button', { name: 'Nouvel utilisateur' })
  const visible = await btn.isVisible().catch(() => false)
  if (!visible) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 500))
    console.log('USERS PAGE BLOCKED. BODY:', JSON.stringify(body))
    await browser.close(); process.exit(0)
  }
  console.log('USERS PAGE OK')

  // 3) create member
  await btn.click()
  await page.waitForTimeout(1500)
  const suffix = Date.now().toString().slice(-7)
  const member = { name: 'UiMembre ' + suffix, loginId: 'uim' + suffix, email: 'uim' + suffix + '@neoxerp.app', role: 'Vendeur', password: 'UiMembre99!' }
  const modalInputs = page.locator('.fixed input')
  await modalInputs.nth(0).fill(member.name)
  await modalInputs.nth(1).fill(member.loginId)
  await modalInputs.nth(2).fill(member.email)
  await modalInputs.nth(4).fill(member.role)
  await modalInputs.nth(5).fill(member.password)
  await page.getByRole('button', { name: "Créer l'utilisateur" }).click()
  await page.waitForTimeout(10000)
  const createOk = await page.evaluate(() => document.body.innerText.includes('Utilisateur créé'))
  const errorsNow = [...logs]
  console.log('CREATE OK:', createOk)
  console.log('ERRORS AFTER CREATE:', JSON.stringify(errorsNow))

  // 4) logout + login as member in a FRESH context (another phone/computer)
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  await uiLogin(page2, member.loginId, member.password)
  await page2.waitForTimeout(12000)
  console.log('MEMBER URL:', page2.url())
  const body = await page2.evaluate(() => document.body.innerText.slice(0, 200))
  console.log('MEMBER BODY:', JSON.stringify(body))
  console.log('MEMBER LOGIN:', page2.url().includes('/login') ? 'FAILED' : 'SUCCESS')
  await ctx2.close()

  // also test login by email
  const ctx3 = await browser.newContext()
  const page3 = await ctx3.newPage()
  await uiLogin(page3, member.email, member.password)
  await page3.waitForTimeout(12000)
  console.log('MEMBER BY EMAIL URL:', page3.url())
  console.log('MEMBER BY EMAIL:', page3.url().includes('/login') ? 'FAILED' : 'SUCCESS')
  await ctx3.close()
} catch (e) {
  console.log('SCRIPT ERROR:', e.message)
  console.log('LOGS:', JSON.stringify(logs))
}
await browser.close()