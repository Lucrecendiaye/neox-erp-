import { test } from '@playwright/test'

test('DEPLOYED: check login UI version + member login', async ({ page }) => {
  await page.goto('https://neox-erp.vercel.app/login')
  await page.waitForTimeout(4000)
  const hasContinuer = await page.getByRole('button', { name: 'Continuer' }).isVisible().catch(() => false)
  console.log('DEPLOYED 2-STEP (Continuer):', hasContinuer)
  const sel = await page.locator('input').count()
  console.log('DEPLOYED inputs:', sel)
  if (hasContinuer) {
    console.log('NEW BUILD IS LIVE')
  } else {
    console.log('STILL OLD BUILD')
  }
})