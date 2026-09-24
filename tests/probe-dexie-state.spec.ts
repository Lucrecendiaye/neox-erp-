import { test, Page } from '@playwright/test'

test('inspect chief dexie state after login', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  await page.goto('/login')
  await page.waitForTimeout(1500)
  await page.getByPlaceholder('exemple@email.com').fill('chief-1786551883084@neoxerp.app')
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.waitForTimeout(1000)
  await page.getByPlaceholder('••••••••').first().fill('Chief123!')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForTimeout(15000)

  const state = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts')).default
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const st = useAppStore.getState()
    const users = await db.users.toArray()
    const businesses = await db.businesses.toArray()
    return {
      url: location.href,
      user: st.user ? { id: st.user.id, name: st.user.name, businessId: st.user.businessId, permissions: st.user.permissions, isPrimaryAdmin: st.user.isPrimaryAdmin } : null,
      currentBusiness: st.currentBusiness ? st.currentBusiness.id : null,
      currentBusinessName: st.currentBusiness ? st.currentBusiness.name : null,
      users: users.map(u => ({ id: u.id, name: u.name, loginId: u.loginId, businessId: u.businessId, role: u.role, isPrimaryAdmin: u.isPrimaryAdmin })),
      businesses: businesses.map(b => ({ id: b.id, name: b.name })),
      localBusinessId: localStorage.getItem('neox-current-business-id'),
      sessionReady: localStorage.getItem('neox-session-ready'),
    }
  })
  console.log('STATE:', JSON.stringify(state, null, 2))
  console.log('CONSOLE ERRORS:', JSON.stringify(errors, null, 2))
})