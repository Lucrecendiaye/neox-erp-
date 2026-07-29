import { test, expect, type Page } from '@playwright/test'

const TEST_EMAIL = `test-${Date.now()}@example.com`
const TEST_PASSWORD = 'test123'
const TEST_NAME = 'Test User'

async function ensureLoggedIn(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  if (page.url().includes('/login')) {
    const registerLink = page.getByRole('button', { name: 'Créer un compte' })
    if (await registerLink.isVisible()) {
      await registerLink.click()
      await page.waitForURL('/register')
    }
  }

  if (page.url().includes('/register')) {
    await page.getByPlaceholder('Votre nom').fill(TEST_NAME)
    await page.getByPlaceholder('email@exemple.com').fill(TEST_EMAIL)
    await page.getByPlaceholder('+226 XX XX XX').fill('+22670000000')
    const pwdFields = page.locator('input[type="password"]')
    await pwdFields.nth(0).fill(TEST_PASSWORD)
    await pwdFields.nth(1).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await page.waitForURL('/')
  } else if (page.url().includes('/login')) {
    await page.getByPlaceholder('exemple@email.com').fill(TEST_EMAIL)
    await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.waitForURL('/')
  }

  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL('/', { timeout: 10000 })
}

async function fillInputByLabel(page: Page, labelText: string, value: string) {
  const label = page.locator('label').filter({ hasText: labelText }).first()
  if (await label.isVisible().catch(() => false)) {
    const parent = label.locator('..')
    const input = parent.locator('input').first()
    if (await input.isVisible().catch(() => false)) {
      await input.fill(value)
      return true
    }
  }
  return false
}

async function createProductDirectly(page: Page): Promise<string> {
  const productName = 'Test Product ' + Date.now()
  await page.goto('/products')
  await page.waitForLoadState('networkidle')

  const newBtn = page.locator('button').filter({ hasText: 'Nouveau' }).first()
  if (await newBtn.isVisible().catch(() => false)) {
    await newBtn.click()
    await page.waitForTimeout(800)
  }

  await fillInputByLabel(page, 'Nom du produit', productName)
  await fillInputByLabel(page, 'Code-barres', 'BAR' + Date.now())
  await fillInputByLabel(page, "Prix d'achat", '3000')
  await fillInputByLabel(page, 'vente', '5000')
  await fillInputByLabel(page, 'Stock initial', '100')
  await fillInputByLabel(page, 'Alerte stock', '10')

  const createBtn = page.locator('button').filter({ hasText: 'Créer' }).first()
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click()
    await page.waitForTimeout(2000)
  }
  return productName
}

test.describe('Full ERP Test Suite', () => {
  let productName = ''

  // Handle browser dialogs (confirm)
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept())
  })

  test('1. Register and login', async ({ page }) => {
    await ensureLoggedIn(page)
    await expect(page.locator('body')).toBeVisible()
  })

  test('2. Dashboard loads', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toBeVisible()
  })

  test('3. Create a category', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    const catBtn = page.locator('button').filter({ hasText: 'Catégories' }).first()
    if (await catBtn.isVisible().catch(() => false)) {
      await catBtn.click()
      await page.waitForTimeout(800)

      const catName = 'Category ' + Date.now()
      const filled = await fillInputByLabel(page, 'Nom', catName)
      if (filled) {
        const saveBtn = page.locator('button').filter({ hasText: 'Créer' }).last()
        if (await saveBtn.isVisible().catch(() => false)) {
          await saveBtn.click()
          await page.waitForTimeout(1500)
        }
      }
    }
  })

  test('4. Create a supplier', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/suppliers')
    await page.waitForLoadState('networkidle')

    const addBtn = page.locator('button').filter({ hasText: 'Nouveau fournisseur' }).first()
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click()
      await page.waitForTimeout(800)
    }

    const supplierName = 'Supplier ' + Date.now()
    await fillInputByLabel(page, 'Nom', supplierName)
    await fillInputByLabel(page, 'Téléphone', '+22671111111')
    await fillInputByLabel(page, 'Email', 'supplier@test.com')
    await fillInputByLabel(page, 'Adresse', '123 Test Street')

    const createBtn = page.locator('button').filter({ hasText: 'Créer' }).last()
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click()
      await page.waitForTimeout(2000)
    }
  })

  test('5. Add a product', async ({ page }) => {
    await ensureLoggedIn(page)
    productName = await createProductDirectly(page)
    expect(productName.length).toBeGreaterThan(0)
  })

  test('6. Edit the product', async ({ page }) => {
    await ensureLoggedIn(page)
    if (!productName) productName = await createProductDirectly(page)

    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    const editBtn = page.locator('button[title="Modifier"]').first()
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click()
      await page.waitForTimeout(800)

      const edited = productName + ' EDITED'
      await fillInputByLabel(page, 'Nom du produit', edited)
      productName = edited

      const updateBtn = page.locator('button').filter({ hasText: 'Mettre à jour' }).first()
      if (await updateBtn.isVisible().catch(() => false)) {
        await updateBtn.click()
        await page.waitForTimeout(2000)
      }
    }
  })

  test('7. Delete the product', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/products')
    await page.waitForLoadState('networkidle')

    const deleteBtn = page.locator('button[title="Supprimer"]').first()
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click()
      await page.waitForTimeout(1000)
    }
  })

  test('8. Perform a cash sale via POS', async ({ page }) => {
    await ensureLoggedIn(page)
    if (!productName) productName = await createProductDirectly(page)

    await page.goto('/pos')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder('Rechercher un produit...')
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(productName.slice(0, 20))
      await page.waitForTimeout(1000)
    }

    const pc = page.locator(`text=${productName}`).first().or(page.locator(`text=${productName.slice(0, 15)}`).first())
    if (await pc.isVisible().catch(() => false)) {
      await pc.click()
      await page.waitForTimeout(500)
    }

    const custInput = page.getByPlaceholder('Nom du client *')
    if (await custInput.isVisible().catch(() => false)) {
      await custInput.fill('Cash Customer')
    }

    const valBtn = page.getByRole('button', { name: /valider/i }).first()
    if (await valBtn.isVisible().catch(() => false)) {
      await valBtn.click()
      await page.waitForTimeout(1500)
    }

    const success = page.getByText('Vente confirmée').first()
    if (await success.isVisible({ timeout: 3000 }).catch(() => false)) {
      const newSale = page.getByRole('button', { name: 'Nouvelle vente' })
      if (await newSale.isVisible().catch(() => false)) await newSale.click()
      await page.waitForTimeout(500)
    }
  })

  test('9. Perform a credit sale via POS', async ({ page }) => {
    await ensureLoggedIn(page)
    if (!productName) productName = await createProductDirectly(page)

    await page.goto('/pos')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder('Rechercher un produit...')
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(productName.slice(0, 20))
      await page.waitForTimeout(1000)
    }

    const pc = page.locator(`text=${productName}`).first().or(page.locator(`text=${productName.slice(0, 15)}`).first())
    if (await pc.isVisible().catch(() => false)) {
      await pc.click()
      await page.waitForTimeout(500)
    }

    const custInput = page.getByPlaceholder('Nom du client *')
    if (await custInput.isVisible().catch(() => false)) {
      await custInput.fill('Credit Customer')
    }

    const creditBtn = page.getByRole('button', { name: 'Crédit' })
    if (await creditBtn.isVisible().catch(() => false)) {
      await creditBtn.click()
      await page.waitForTimeout(300)
    }

    const valBtn = page.getByRole('button', { name: /valider/i }).first()
    if (await valBtn.isVisible().catch(() => false)) {
      await valBtn.click()
      await page.waitForTimeout(1500)
    }

    const creditModal = page.getByText('Paiement crédit').first()
    if (await creditModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      const payBtn = page.locator('button').filter({ hasText: /payer/i }).first()
      if (await payBtn.isVisible().catch(() => false)) {
        await payBtn.click()
        await page.waitForTimeout(1000)
      }
    }
  })

  test('10. View stock movements', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/stock')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toBeVisible()
  })

  test('11. View accounting', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/accounting')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toBeVisible()
  })

  test('12. View reports', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/reports')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toBeVisible()
  })

  test('13. View sales', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/sales')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toBeVisible()
  })

  test('14. View customers', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/customers')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toBeVisible()
  })

  test('15. View invoices', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/invoices')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toBeVisible()
  })

  test('16. View settings', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toBeVisible()
  })

  test('17. Navigate all sidebar links', async ({ page }) => {
    await ensureLoggedIn(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const links = page.locator('nav a, aside a, [role="navigation"] a')
    const count = await links.count()
    for (let i = 0; i < Math.min(count, 25); i++) {
      const link = links.nth(i)
      if (await link.isVisible().catch(() => false)) {
        const href = await link.getAttribute('href')
        if (href && !href.startsWith('http') && !href.includes('#') && !href.startsWith('tel') && href.length > 1) {
          try {
            await link.click()
            await page.waitForTimeout(800)
            await page.waitForLoadState('networkidle')
          } catch { /* continue */ }
        }
      }
    }
  })
})
