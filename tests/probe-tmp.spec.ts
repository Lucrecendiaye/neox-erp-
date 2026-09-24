import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

test('probe settings', async ({ browser }) => {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/settings')
  await page.waitForLoadState('load')
  await page.waitForTimeout(2500)

  const offenders = await page.evaluate(() => {
    function isScrollable(el: Element) {
      let p = el.parentElement
      while (p) {
        const cs = getComputedStyle(p)
        if (/(auto|scroll)/.test(cs.overflowX)) return true
        p = p.parentElement
      }
      return false
    }
    const out: any[] = []
    const btns = document.querySelectorAll('button')
    for (let i = 0; i < btns.length; i++) {
      const btn = btns[i]
      const r = btn.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(btn)
      if (cs.opacity === '0' || cs.visibility === 'hidden' || cs.display === 'none') continue
      if (isScrollable(btn)) continue
      if (r.right > window.innerWidth + 1 || r.left < -1) {
        const parents: any[] = []
        let p = btn.parentElement
        for (let j = 0; j < 8 && p; j++) {
          const pr = p.getBoundingClientRect()
          parents.push({ tag: p.tagName, cls: (p.className as string).slice(0, 90), left: Math.round(pr.left), right: Math.round(pr.right), width: Math.round(pr.width), ow: getComputedStyle(p).overflowX })
          p = p.parentElement
        }
        out.push({ text: (btn.textContent || 'btn').trim().slice(0, 30), cls: (btn.className as string).slice(0, 90), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), parents })
      }
    }
    return out
  })
  console.log('OFFENDERS=' + JSON.stringify(offenders))
})
