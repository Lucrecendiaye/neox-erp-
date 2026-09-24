import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage()
const logs = []
page.on('request', r => {
  const u = r.url()
  if (u.includes('supabase.co') && !u.includes('ws')) logs.push('REQ: ' + r.method() + ' ' + u.replace(/https:\/\/[^/]+/, '').slice(0, 120))
})
page.on('response', async r => {
  const u = r.url()
  if (u.includes('/auth/v1/token') && r.request().method() === 'POST') {
    let body = ''
    try { body = (await r.text()).slice(0, 250) } catch {}
    logs.push('RESP token ' + r.status() + ' :: ' + body)
  }
  if (u.includes('rpc/public_lookup_profile')) {
    let body = ''
    try { body = (await r.text()).slice(0, 250) } catch {}
    logs.push('RESP lookup ' + r.status() + ' :: ' + body)
  }
})
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message.slice(0, 200)))

await page.goto('https://neox-erp-alpha.vercel.app/login', { waitUntil: 'load', timeout: 45000 })
await page.waitForTimeout(2500)
await page.getByPlaceholder('exemple@email.com').fill('diag-connect@neoxerp.test')
await page.getByRole('button', { name: 'Continuer' }).click()
await page.waitForTimeout(1500)
await page.getByPlaceholder('••••••••').first().fill('DiagPass123!')
await page.getByRole('button', { name: 'Se connecter' }).click()
await page.waitForTimeout(9000)
console.log('FINAL URL:', page.url())
for (const l of logs) console.log(l)
await browser.close()
