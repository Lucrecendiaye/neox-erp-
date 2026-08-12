import { test, Page } from '@playwright/test'

const ADMIN = { identifier: 'chief-1786551883084@neoxerp.app', password: 'Chief123!' }
const ADMIN_UID = 'bba3d69a-3dd3-49a9-84cc-b02209c5135c'
const BIZ = '9173b109-093e-4665-adfa-599d35814d96'

async function login(page: Page, identifier: string, password: string) {
  await page.goto('/login')
  await page.waitForTimeout(1500)
  await page.getByPlaceholder('exemple@email.com').fill(identifier)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.waitForTimeout(1000)
  await page.getByPlaceholder('••••••••').first().fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

test('END-TO-END: admin creates member (custom loginId) then member logs in', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })

  await login(page, ADMIN.identifier, ADMIN.password)
  await page.waitForTimeout(12000)

  // Ensure local users populated so UsersPage renders (admin NOT primary → auto-promotion effect must unlock it)
  await page.evaluate(async (args) => {
    const db = (await import('/src/db/index.ts')).default
    await db.users.put({
      id: args.uid, businessId: args.biz, name: 'Chief', email: 'chief@x.app',
      loginId: 'chief', passwordHash: '', role: 'admin', permissions: ['*'],
      isActive: true, isPrimaryAdmin: false, status: 'active',
      createdAt: new Date().toISOString(),
    })
  }, { uid: ADMIN_UID, biz: BIZ })

  await page.goto('/users')
  await page.waitForTimeout(4000)
  const btn = page.getByRole('button', { name: 'Nouvel utilisateur' })
  if (!(await btn.isVisible().catch(() => false))) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 400))
    console.log('USERS PAGE:', JSON.stringify(body))
    throw new Error('users button not visible')
  }
  await btn.click()

  const suffix = Date.now().toString().slice(-7)
  const member = {
    name: 'UiMembre ' + suffix,
    loginId: 'uim' + suffix,
    email: 'uim' + suffix + '@neoxerp.app',
    role: 'Vendeur',
    password: 'UiMembre99!',
  }
  const modalInputs = page.locator('.fixed input')
  await modalInputs.nth(0).fill(member.name)
  await modalInputs.nth(1).fill(member.loginId)
  await modalInputs.nth(2).fill(member.email)
  await modalInputs.nth(4).fill(member.role)
  await modalInputs.nth(5).fill(member.password)
  await page.getByRole('button', { name: "Créer l'utilisateur" }).click()
  await page.waitForTimeout(8000)
  const createOk = await page.evaluate(() => document.body.innerText.includes('Utilisateur créé'))
  console.log('CREATE OK:', createOk)
  console.log('ERRORS AFTER CREATE:', JSON.stringify(errors))

  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')

  await login(page, member.loginId, member.password)
  await page.waitForTimeout(10000)
  console.log('MEMBER URL:', page.url())
  const body = await page.evaluate(() => document.body.innerText.slice(0, 300))
  console.log('MEMBER BODY:', JSON.stringify(body))
  if (page.url().includes('/login')) console.log('RESULT: MEMBER LOGIN FAILED')
  else console.log('RESULT: MEMBER LOGIN SUCCESS')
})