import { chromium } from 'playwright'

const BASE = 'https://neox-erp-alpha.vercel.app'
const EMAIL = 'boutique@neoxerp.com'
const PASS = 'Test@123456'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  page.on('console', msg => { if (msg.type() === 'error') console.log(`  [CONSOLE] ${msg.text()}`) })
  page.on('pageerror', err => console.log(`  [PAGE_ERROR] ${err.message}`))

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.fill('input[placeholder*="email"]', EMAIL)
  await page.fill('input[placeholder*="••••"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(4000)

  await page.goto(BASE + '/pos', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(3000)

  // Fill customer
  const customerField = await page.$('input[placeholder="Nom du client *"]')
  if (customerField) await customerField.fill('Test Client')
  
  // Try to click product by text content
  const productBtn = await page.locator('button').filter({ hasText: /Gaine ventre plat/ }).first()
  console.log('Product button exists:', await productBtn.count())
  
  if (await productBtn.count() > 0) {
    console.log('Product button text:', await productBtn.textContent())
    console.log('Product button disabled:', await productBtn.isDisabled())
    await productBtn.click()
    await page.waitForTimeout(1000)
    
    // Check cart
    const bodyText = await page.textContent('body')
    if (bodyText.includes('Valider') && !bodyText.includes('Valider ( 0)')) {
      console.log('✅ Product added to cart!')
    } else {
      console.log('❌ Cart still empty')
      // Extract text around Valider
      const match = bodyText.match(/Valider \([\d\s]+\)/)
      if (match) console.log('Valider text:', match[0])
    }
  }

  await browser.close()
}

run().catch(e => { console.error(e); process.exit(1) })
