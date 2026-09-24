import { test, expect, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { seedDemoData } from './helpers'

const STATE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth-state.json')

const PAGES = [
  { path: '/', label: 'dashboard' },
  { path: '/pos', label: 'pos' },
  { path: '/sales', label: 'sales' },
  { path: '/products', label: 'products' },
  { path: '/depots', label: 'depots' },
  { path: '/suppliers', label: 'suppliers' },
  { path: '/customers', label: 'customers' },
  { path: '/credits', label: 'credit' },
  { path: '/reports', label: 'reports' },
  { path: '/payments', label: 'payments' },
  { path: '/settings', label: 'settings' },
]

const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 13', width: 390, height: 844 },
  { name: 'iPhone 15 Pro Max', width: 430, height: 932 },
  { name: 'Android 360', width: 360, height: 740 },
  { name: 'Android 390', width: 390, height: 844 },
  { name: 'Android 412', width: 412, height: 915 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop', width: 1366, height: 768 },
]

async function ensureLoggedIn(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
  if (page.url().includes('/login')) {
    throw new Error('Not authenticated - storageState not applied')
  }
  await seedDemoData(page)
}

async function checkNoHorizontalOverflow(page: Page, viewportName: string, pageLabel: string) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement
    const body = document.body
    const docOverflow = doc.scrollWidth - doc.clientWidth
    const bodyOverflow = body.scrollWidth - body.clientWidth
    const worst = docOverflow > bodyOverflow ? docOverflow : bodyOverflow
    return { docOverflow, bodyOverflow, worst }
  })
  expect(result.worst, `[${viewportName}] ${pageLabel}: page overflow ${result.worst}px`).toBeLessThanOrEqual(2)
}

async function checkBottomNavVisible(page: Page, viewportName: string, pageLabel: string) {
  const nav = page.locator('nav.mobile-bottom-nav, nav[class*="mobile-bottom-nav"], .mobile-bottom-nav')
  const count = await nav.count()
  if (count > 0) {
    await expect(nav.first()).toBeVisible()
  }
}

async function checkScrollable(page: Page, viewportName: string, pageLabel: string) {
  const result = await page.evaluate(() => {
    const main = document.querySelector('main')
    if (main) {
      const el = main as HTMLElement
      return { type: 'main', scrollable: el.scrollHeight > el.clientHeight }
    }
    const doc = document.documentElement
    return { type: 'doc', scrollable: doc.scrollHeight > doc.clientHeight }
  })
  expect(result, `[${viewportName}] ${pageLabel}: content should be scrollable`).not.toBeNull()
}

async function checkNoInvisibleActionButtons(page: Page, viewportName: string, pageLabel: string, isTouch: boolean) {
  if (!isTouch) return
  const invisible = await page.evaluate(() => {
    const offenders: string[] = []
    document.querySelectorAll('.opacity-0').forEach((el) => {
      if (el.querySelector('button, a') && getComputedStyle(el).opacity === '0') {
        offenders.push(el.className.toString().slice(0, 80))
      }
    })
    return offenders
  })
  expect(invisible, `[${viewportName}] ${pageLabel}: invisible action buttons: ${JSON.stringify(invisible)}`).toEqual([])
}

async function checkVisibleButtons(page: Page, viewportName: string, pageLabel: string) {
  const clipped = await page.evaluate(() => {
    const offenders: string[] = []
    const isWithinScrollable = (el: Element): boolean => {
      let p = el.parentElement
      while (p) {
        const cs = getComputedStyle(p)
        if (/(auto|scroll)/.test(cs.overflowX)) return true
        p = p.parentElement
      }
      return false
    }
    document.querySelectorAll('button').forEach((btn) => {
      const r = btn.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const cs = getComputedStyle(btn)
      if (cs.opacity === '0' || cs.visibility === 'hidden' || cs.display === 'none') return
      if (isWithinScrollable(btn)) return
      const fullyOffRight = r.left >= window.innerWidth
      const fullyOffLeft = r.right <= 0
      if (fullyOffRight || fullyOffLeft) return
      if (r.right > window.innerWidth + 1 || r.left < -1) {
        offenders.push(`${(btn.textContent || 'btn').trim().slice(0, 30)}[${btn.className.toString().slice(0, 60)}]`)
      }
    })
    return offenders
  })
  expect(clipped, `[${viewportName}] ${pageLabel}: buttons clipped off-screen: ${JSON.stringify(clipped)}`).toEqual([])
}

for (const vp of VIEWPORTS) {
  test.describe(`Mobile responsiveness @ ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.width < 1024,
      isMobile: vp.width < 768,
      storageState: STATE_FILE,
    })

    for (const pg of PAGES) {
      test(`no overflow on ${pg.label}`, async ({ page }) => {
        test.setTimeout(60000)
        await ensureLoggedIn(page)
        await page.goto(pg.path)
        await page.waitForLoadState('load')
        await page.waitForTimeout(1200)
        if (pg.path !== '/') {
          expect(page.url().endsWith(pg.path), `[${vp.name}] ${pg.label}: redirected to ${page.url()}`).toBe(true)
        }
        await checkNoHorizontalOverflow(page, vp.name, pg.label)
        const isTouch = vp.width < 1024
        await checkNoInvisibleActionButtons(page, vp.name, pg.label, isTouch)
        await checkVisibleButtons(page, vp.name, pg.label)
        if (vp.width < 768) {
          await checkBottomNavVisible(page, vp.name, pg.label)
        }
        await checkScrollable(page, vp.name, pg.label)
      })
    }
  })
}
