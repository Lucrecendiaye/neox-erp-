import { test, expect } from '@playwright/test'

test.describe('Multi-Tenant Data Isolation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear all IndexedDB before each test
    await page.goto('/')
    await page.evaluate(() => {
      indexedDB.deleteDatabase('neox_erp')
    })
    await page.reload()
  })

  test('Two businesses must not see each other\'s data', async ({ page }) => {
    // ========== STEP 1: Register User (creates Business A) ==========
    await page.goto('/register')
    await page.waitForLoadState('networkidle')

    await page.fill('input[type="text"][placeholder*="Nom"]', 'Test User')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[placeholder*="Téléphone"]', '70000001')
    await page.fill('input[type="password"]', 'test1234')
    await page.fill('input[placeholder*="Confirmer"]', 'test1234')
    await page.click('button[type="submit"]')

    // Wait for redirect to login
    await page.waitForURL('**/login', { timeout: 10000 })

    // ========== STEP 2: Login ==========
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'test1234')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    // ========== STEP 3: Create a product in Business A ==========
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    // Click "Nouveau produit"
    const newProductBtn = page.locator('button', { hasText: /Nouveau.*produit/i }).first()
    if (await newProductBtn.isVisible()) {
      await newProductBtn.click()
    } else {
      // Try alternative button
      await page.locator('button').filter({ hasText: /Produit/i }).first().click()
    }

    // Fill product form
    await page.waitForTimeout(500)
    const nameInput = page.locator('input[placeholder*="Nom"]').first()
    if (await nameInput.isVisible()) {
      await nameInput.fill('Produit-BoutiqueA')
    } else {
      // Try another field
      const inputs = page.locator('input')
      const count = await inputs.count()
      // Fill the first several inputs
      for (let i = 0; i < Math.min(count, 5); i++) {
        const input = inputs.nth(i)
        const type = await input.getAttribute('type')
        if (type !== 'submit' && type !== 'button') {
          const val = await input.inputValue()
          if (!val) {
            await input.fill(i === 0 ? 'Produit-BoutiqueA' : i === 1 ? '1000' : i === 2 ? '2000' : '10')
            break
          }
        }
      }
    }

    // Save / Create button
    const saveBtn = page.locator('button').filter({ hasText: /Enregistrer|Créer|Sauvegarder/i }).first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
    }
    await page.waitForTimeout(1000)

    // Verify product appears
    await expect(page.locator('text=Produit-BoutiqueA').first()).toBeVisible({ timeout: 5000 })

    // ========== STEP 4: Create Business B ==========
    await page.goto('/businesses')
    await page.waitForLoadState('networkidle')

    // Click create business
    await page.locator('button').filter({ hasText: /Nouvelle.*boutique|Nouveau.*business|Ajouter|Créer.*boutique/i }).first().click()
    await page.waitForTimeout(500)

    // Fill business name
    const bizInput = page.locator('input[placeholder*="Nom"]').first()
    await bizInput.fill('Boutique B')
    // Fill currency
    const currencyInput = page.locator('input[placeholder*="Devise"]').first()
    if (await currencyInput.isVisible()) {
      await currencyInput.fill('XOF')
    }

    // Save
    await page.locator('button').filter({ hasText: /Enregistrer|Créer|Sauvegarder/i }).first().click()
    await page.waitForTimeout(1000)

    // Switch to Business B
    const bizB = page.locator('text=Boutique B').first()
    await expect(bizB).toBeVisible({ timeout: 5000 })

    // Click on Business B to switch to it
    // Look for a switch/select button near Business B
    const switchBtn = page.locator('text=Boutique B').locator('..').locator('button, a').first()
    if (await switchBtn.isVisible()) {
      await switchBtn.click()
    } else {
      // Try clicking the business card
      await page.locator('text=Boutique B').first().click()
    }
    await page.waitForTimeout(1000)

    // ========== STEP 5: Go to products in Business B ==========
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    // Verify "Produit-BoutiqueA" is NOT visible in Business B
    const productA = page.locator('text=Produit-BoutiqueA')
    await expect(productA).not.toBeVisible({ timeout: 3000 })

    // ========== STEP 6: Create a product in Business B ==========
    const newProdBtn2 = page.locator('button').filter({ hasText: /Nouveau.*produit/i }).first()
    if (await newProdBtn2.isVisible()) {
      await newProdBtn2.click()
    }

    await page.waitForTimeout(500)
    const nameInput2 = page.locator('input[placeholder*="Nom"]').first()
    if (await nameInput2.isVisible()) {
      await nameInput2.fill('Produit-BoutiqueB')
    }

    const saveBtn2 = page.locator('button').filter({ hasText: /Enregistrer|Créer|Sauvegarder/i }).first()
    if (await saveBtn2.isVisible()) {
      await saveBtn2.click()
    }
    await page.waitForTimeout(1000)

    // Verify product B appears
    await expect(page.locator('text=Produit-BoutiqueB').first()).toBeVisible({ timeout: 5000 })
    // Verify product A still not visible
    await expect(page.locator('text=Produit-BoutiqueA')).not.toBeVisible({ timeout: 3000 })

    // ========== STEP 7: Switch back to Business A ==========
    await page.goto('/businesses')
    await page.waitForLoadState('networkidle')

    const bizA = page.locator('text=Test User\'s Shop').first()
    if (await bizA.isVisible()) {
      await bizA.locator('..').locator('button, a').first().click()
    }
    await page.waitForTimeout(1000)

    // ========== STEP 8: Verify Business A only sees its product ==========
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=Produit-BoutiqueA').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Produit-BoutiqueB')).not.toBeVisible({ timeout: 3000 })

    // ========== STEP 9: Verify product counts match ==========
    // Count unique product names visible
    const visibleProducts = await page.locator('table tbody tr, .product-card, [class*="product"]').count()
    expect(visibleProducts).toBeGreaterThanOrEqual(1)
  })
})
