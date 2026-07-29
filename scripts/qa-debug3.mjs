import { chromium } from 'playwright'

const BASE = 'https://neox-erp-alpha.vercel.app'
const EMAIL = 'boutique@neoxerp.com'
const PASS = 'Test@123456'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  page.on('console', msg => { if (msg.type() === 'error') console.log(`  [ERR] ${msg.text()}`) })
  page.on('pageerror', err => console.log(`  [PAGE_ERR] ${err.message}`) )

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.fill('input[placeholder*="email"]', EMAIL)
  await page.fill('input[placeholder*="••••"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(5000)

  await page.goto(BASE + '/pos', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  // Fill customer
  await page.locator('input[placeholder="Nom du client *"]').fill('Test')

  // Try clicking various product buttons
  let productClicked = false
  for (const name of ['Gaine ventre plat', 'Gaine sculptante', 'Gaine taille', 'Soutien-gorge']) {
    const btn = page.locator('button').filter({ hasText: new RegExp(name) }).first()
    if (await btn.count() > 0) {
      console.log(`Trying to click: ${name}`)
      const text = await btn.textContent()
      console.log(`  Button text: "${text.substring(0,60)}"`)
      console.log(`  Disabled: ${await btn.isDisabled()}`)
      
      // Try clicking
      try {
        await btn.click({ force: true, timeout: 5000 })
        await page.waitForTimeout(1000)
        const valText = await page.locator('button').filter({ hasText: /Valider/ }).first().textContent()
        console.log(`  After click - Valider text: "${valText}"`)
        if (!valText.includes('( 0)')) {
          productClicked = true
          console.log('  ✅ Product added to cart!')
          break
        }
      } catch(e) {
        console.log(`  Click failed: ${e.message}`)
      }
    }
  }

  if (!productClicked) {
    console.log('\nCart still empty - trying to debug cart state')
    // Check if there's a cart section
    const bodyText = await page.textContent('body')
    const validerMatch = bodyText.match(/Valider \([^)]+\)/)
    if (validerMatch) console.log('Valider text:', validerMatch[0])
    
    // Check for cart items
    const cartItems = await page.locator('[class*="cart"]').all()
    console.log('Cart elements:', cartItems.length)
    
    // Check for any error boundary
    const errBoundary = await page.$('[class*="error"]')
    if (errBoundary) console.log('Error boundary found:', await errBoundary.textContent())
  }

  // Now check depots after waiting
  console.log('\n=== DEPOTS ===')
  await page.waitForTimeout(3000)
  await page.goto(BASE + '/depots', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const depText = await page.textContent('body')
  console.log('Has Nord:', depText.includes('Nord'))
  console.log('Has Centre:', depText.includes('Centre'))
  console.log('Depots excerpt:', depText.substring(depText.indexOf('Dépôts'), depText.indexOf('Dépôts') + 300))

  await browser.close()
}

run().catch(e => { console.error(e); process.exit(1) })
