import { chromium } from 'playwright'

const BASE = 'https://neox-erp-alpha.vercel.app'
const EMAIL = 'boutique@neoxerp.com'
const PASS = 'Test@123456'

let passed = 0, failed = 0, errors = []
function check(label, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; errors.push(`${label}: ${detail}`); console.log(`  ❌ ${label}: ${detail}`) }
}
async function ss(page, name) { await page.screenshot({ path: `qa-reports/${name}.png`, fullPage: true }) }

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  // page.on('pageerror', err => console.log(`  [PAGE_ERROR] ${err.message}`))
  // page.on('console', msg => { if (msg.type() === 'error') console.log(`  [CONSOLE] ${msg.text()}`) })

  try {
    // ===== 1. LOGIN =====
    console.log('\n📝 1. LOGIN')
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '01-login')
    await page.fill('input[placeholder*="email"]', EMAIL)
    await page.fill('input[placeholder*="••••"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(5000)
    const body = await page.textContent('body')
    check('Login success', body.includes('Tableau') || body.includes('POS') || body.includes('Vente'))
    await ss(page, '02-logged-in')
    await page.waitForTimeout(5000)

    // ===== 2. DASHBOARD =====
    console.log('\n📊 2. DASHBOARD')
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    await ss(page, '03-dashboard')
    const dash = await page.textContent('body')
    check('Dashboard loads', dash.includes('Produit') || dash.includes('Vente') || dash.includes('Stock'))

    // ===== 3. POS - Cash Sale =====
    console.log('\n🛒 3. POS - Cash Sale')
    await page.goto(BASE + '/pos', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    await ss(page, '04-pos')

    await page.locator('input[placeholder="Nom du client *"]').fill('Test Client')
    
    const prodBtn = page.locator('button').filter({ hasText: /Gaine ventre plat/ }).first()
    check('Product card visible', await prodBtn.count() > 0)

    await prodBtn.click({ force: true })
    await page.waitForTimeout(500)

    const valBtn = page.locator('button').filter({ hasText: /Valider/ }).first()
    const valText = await valBtn.textContent()
    check(`Cart has item (${valText})`, !valText.includes('( 0)'))

    await valBtn.click()
    await page.waitForTimeout(3000)
    await ss(page, '05-pos-complete')
    const posResult = await page.textContent('body')
    check('Sale confirmed', posResult.includes('Facture') || posResult.includes('Ticket') || posResult.includes('imprim') || posResult.includes('succès') || posResult.includes('Succès'))

    // ===== 4. PRODUCTS =====
    console.log('\n📦 4. PRODUCTS')
    await page.goto(BASE + '/products', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await ss(page, '06-products')
    const prod = await page.textContent('body')
    check('Product count visible', prod.includes('12') || prod.includes('produit'))
    check('Stock value', prod.includes('10') || prod.includes('valeur'))

    // ===== 5. SALES =====
    console.log('\n📋 5. SALES')
    await page.goto(BASE + '/sales', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await ss(page, '07-sales')
    const sales = await page.textContent('body')
    check('Sales page loads', sales.includes('Vente') || sales.includes('vente'))

    // ===== 6. PURCHASES =====
    console.log('\n📦 6. PURCHASES')
    await page.goto(BASE + '/purchases', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '08-purchases')

    // ===== 7. STOCK =====
    console.log('\n🏬 7. STOCK')
    await page.goto(BASE + '/stock', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '09-stock')

    // ===== 8. CUSTOMERS =====
    console.log('\n👥 8. CUSTOMERS')
    await page.goto(BASE + '/customers', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '10-customers')

    // ===== 9. SUPPLIERS =====
    console.log('\n🏭 9. SUPPLIERS')
    await page.goto(BASE + '/suppliers', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '11-suppliers')
    const sup = await page.textContent('body')
    check('Suppliers visible', sup.includes('Import') || sup.includes('Textile'))

    // ===== 10. DEPOTS =====
    console.log('\n📍 10. DEPOTS')
    await page.goto(BASE + '/depots', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    await ss(page, '12-depots')
    const dep = await page.textContent('body')
    check('Shop (Boutique) visible', dep.includes('Boutique'))
    check('Depot Nord visible', dep.includes('Nord'))
    check('Depot Centre visible', dep.includes('Centre'))

    // ===== 11. REPORTS =====
    console.log('\n📈 11. REPORTS')
    await page.goto(BASE + '/reports', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '13-reports')

    // ===== 12. USERS =====
    console.log('\n👤 12. USERS')
    await page.goto(BASE + '/users', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '14-users')

    // ===== 13. INVOICES =====
    console.log('\n📄 13. INVOICES')
    await page.goto(BASE + '/invoices', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '15-invoices')

    // ===== 14. CREDITS =====
    console.log('\n💳 14. CREDITS')
    await page.goto(BASE + '/credit', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '16-credits')

    // ===== 15. PAYMENTS =====
    console.log('\n💰 15. PAYMENTS')
    await page.goto(BASE + '/payments', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ss(page, '17-payments')

  } catch (e) {
    console.error('FATAL:', e.message)
    await ss(page, '99-fatal')
    failed++
  }

  await browser.close()

  console.log('\n' + '='.repeat(50))
  console.log('📋 RAPPORT QA FINAL')
  console.log('='.repeat(50))
  console.log(`✅ Passé: ${passed}`)
  console.log(`❌ Échoué: ${failed}`)
  if (errors.length) { console.log('\nErreurs:'); errors.forEach(e => console.log(`  - ${e}`)) }
  console.log(`\n📸 Captures d\'écran dans qa-reports/`)
}

run().catch(e => { console.error(e); process.exit(1) })
