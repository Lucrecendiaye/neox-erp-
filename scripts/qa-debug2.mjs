import { chromium } from 'playwright'

const BASE = 'https://neox-erp-alpha.vercel.app'
const EMAIL = 'boutique@neoxerp.com'
const PASS = 'Test@123456'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  page.on('response', resp => {
    if (resp.status() >= 400) console.log(`  ⚠️ ${resp.status()} ${resp.url().substring(0,120)}`)
  })

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.fill('input[placeholder*="email"]', EMAIL)
  await page.fill('input[placeholder*="••••"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(4000)

  // Wait for sync to complete
  await page.waitForTimeout(3000)

  // Go to depots
  await page.goto(BASE + '/depots', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(5000)

  const bodyText = await page.textContent('body')
  console.log('=== DEPOTS PAGE ===')
  console.log(bodyText.substring(0, 1000))

  // Go to products to verify sync
  await page.goto(BASE + '/products', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(3000)
  const prodText = await page.textContent('body')
  console.log('=== PRODUCTS PAGE (first 500 chars) ===')
  console.log(prodText.substring(0, 500))

  await browser.close()
}

run().catch(e => { console.error(e); process.exit(1) })
