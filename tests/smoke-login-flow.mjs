import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 300)))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)) })

await page.goto('https://neox-erp-alpha.vercel.app/login', { waitUntil: 'load', timeout: 45000 })
await page.waitForTimeout(3000)
await page.getByPlaceholder('exemple@email.com').fill('diag-connect@neoxerp.test')
await page.getByRole('button', { name: 'Continuer' }).click()
await page.waitForTimeout(1500)
const pwd = page.getByPlaceholder('••••••••').first()
await pwd.fill('DiagPass123!')
const body1 = await page.evaluate(() => document.body.innerText.slice(0, 200))
console.log('AVANT CONNECTER:', JSON.stringify(body1.slice(0, 100)))
await page.getByRole('button', { name: 'Se connecter' }).click()
await page.waitForTimeout(8000)
console.log('URL:', page.url())
const body = await page.evaluate(() => document.body.innerText.slice(0, 300))
console.log('BODY:', JSON.stringify(body))
console.log('ERRORS:', JSON.stringify(errors.slice(0, 6)))
await browser.close()
