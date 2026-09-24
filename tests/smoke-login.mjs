import { chromium } from '@playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })

await page.goto('https://neox-erp-alpha.vercel.app/login', { waitUntil: 'load', timeout: 45000 })
await page.waitForTimeout(6000)
console.log('URL:', page.url())
console.log('TITLE:', await page.title())
const body = await page.evaluate(() => document.body.innerText.slice(0, 400))
console.log('BODY:', JSON.stringify(body))
console.log('ERRORS:', JSON.stringify(errors.slice(0, 10), null, 1))

await browser.close()
