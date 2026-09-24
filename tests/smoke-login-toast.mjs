import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const net = []
page.on('request', r => { const u = r.url(); if (u.includes('auth/v1') || u.includes('rpc/')) net.push(r.method() + ' ' + u.split('supabase.co')[1]?.slice(0, 80)) })
page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 300)))

await page.goto('https://neox-erp-alpha.vercel.app/login', { waitUntil: 'load', timeout: 45000 })
await page.waitForTimeout(2500)
await page.getByPlaceholder('exemple@email.com').fill('diag-connect@neoxerp.test')
await page.getByRole('button', { name: 'Continuer' }).click()
await page.waitForTimeout(1200)
await page.getByPlaceholder('••••••••').first().fill('DiagPass123!')
await page.getByRole('button', { name: 'Se connecter' }).click()
await page.waitForTimeout(4000)
const toasts = await page.evaluate(() => {
  const els = [...document.querySelectorAll('div, p, span')].filter(e => (e.textContent || '').match(/incorrect|connexion|confirm|error|identifiant|manuel|Technique|Failed|Error|erreur/i) && e.children.length === 0)
  return els.slice(0, 8).map(e => e.textContent?.trim().slice(0, 120))
})
console.log('NETWORK AUTH:', JSON.stringify(net))
console.log('TOASTS:', JSON.stringify(toasts))
await page.screenshot({ path: 'tests/diag-login.png' })
await browser.close()
