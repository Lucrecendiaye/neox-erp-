import { chromium } from '@playwright/test'

const loginId = process.argv[2]
const password = process.argv[3]
const site = process.argv[4] || 'https://neox-erp-alpha.vercel.app'

const browser = await chromium.launch()
const page = await browser.newPage()
const logs = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push('[' + m.type() + '] ' + m.text().slice(0, 500)) })
page.on('pageerror', e => logs.push('[PAGEERROR] ' + e.message.slice(0, 500)))

try {
  await page.goto(site + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(15000)
  const input = page.locator('input').first()
  await input.fill(loginId)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.waitForTimeout(2000)
  const pwd = page.locator('input[type="password"]').first()
  await pwd.fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForTimeout(15000)
  const url = page.url()
  const body = await page.evaluate(() => document.body.innerText.slice(0, 400))
  const ls = await page.evaluate(() => ({
    sessionReady: localStorage.getItem('neox-session-ready'),
    userId: localStorage.getItem('neox-user-id'),
    biz: localStorage.getItem('neox-current-business-id'),
  }))
  console.log('FINAL URL:', url)
  console.log('BODY:', JSON.stringify(body))
  console.log('LS:', JSON.stringify(ls))
  console.log('LOGS:')
  logs.slice(0, 30).forEach(l => console.log('  ' + l))
} catch (e) {
  console.log('SCRIPT ERROR:', e.message)
  console.log('LOGS:')
  logs.slice(0, 30).forEach(l => console.log('  ' + l))
}
await browser.close()