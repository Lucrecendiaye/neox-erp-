import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { seedDemoData } from './helpers'

const dir = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.join(dir, '.auth-state.json')
const SHOTS = path.join(dir, '..', 'screenshots')
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true })

const PAGES = [
  { path: '/', name: 'dashboard' },
  { path: '/pos', name: 'pos' },
  { path: '/sales', name: 'sales' },
  { path: '/products', name: 'products' },
  { path: '/customers', name: 'customers' },
  { path: '/credits', name: 'credit' },
  { path: '/reports', name: 'reports' },
  { path: '/payments', name: 'payments' },
  { path: '/suppliers', name: 'suppliers' },
  { path: '/depots', name: 'depots' },
  { path: '/settings', name: 'settings' },
]

async function ensureLoggedIn(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
  await seedDemoData(page)
}

for (const vp of [
  { name: 'mob-375', width: 375, height: 667 },
  { name: 'mob-430', width: 430, height: 932 },
]) {
  test.describe(`screenshots @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, storageState: STATE_FILE })

    for (const pg of PAGES) {
      test(`capture ${pg.name}`, async ({ page }) => {
        test.setTimeout(60000)
        await ensureLoggedIn(page)
        await page.goto(pg.path)
        await page.waitForLoadState('load')
        await page.waitForTimeout(1500)
        expect(page.url().endsWith(pg.path), `${pg.name} redirected`).toBe(true)
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-${pg.name}.png`), fullPage: true })
      })
    }
  })
}
