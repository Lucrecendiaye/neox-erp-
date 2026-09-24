import { test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))

test('probe exact push', async ({ browser }) => {
  const state = fs.readFileSync(path.join(dir, '.auth-state.json'), 'utf-8')
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: JSON.parse(state) })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForTimeout(3000)
  const info = await page.evaluate(async () => {
    const db = (await import('/src/db/index.ts')).default
    const { useAppStore } = await import('/src/stores/appStore.ts')
    const { supabase } = await import('/src/lib/supabase.ts')
    const { sanitizePayloadForSync } = await import('/src/lib/imageStorage.ts')
    const st = useAppStore.getState()
    const bizId = st.currentBusiness?.id || st.user?.businessId
    const now = new Date().toISOString()

    const out: Record<string, unknown> = {}

    for (const [table, row] of Object.entries({
      products: { id: 'probe-x-1', businessId: bizId, name: 'X', unit: 'piece', purchasePrice: 1, sellingPrice: 2, margin: 50, taxRate: 0, photos: [], status: 'active', createdAt: now, updatedAt: now },
      sales: { id: 'probe-x-2', businessId: bizId, locationId: 'probe-loc', invoiceNumber: 'FAC-X', items: [], subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0, paid: 0, change: 0, paymentMethod: 'cash', status: 'completed', createdAt: now, userId: 'u' },
      credits: { id: 'probe-x-3', businessId: bizId, customerId: 'c', customerName: 'C', amount: 1, paid: 0, balance: 1, dueDate: now, status: 'active', reminderSent: [], createdAt: now },
      productStocks: { id: 'probe-x-4', businessId: bizId, productId: 'p', locationId: 'l', quantity: 5 },
      locations: { id: 'probe-x-5', businessId: bizId, name: 'L', type: 'boutique', isActive: true, createdAt: now },
    })) {
      const clean = await sanitizePayloadForSync(row as any)
      const { id, ...data } = clean
      const r = await supabase.from(table).upsert({ id, ...data }, { onConflict: 'id' })
      out[table] = r.error?.message || 'OK'
    }
    return { bizId, out }
  })
  console.log('EXACT=' + JSON.stringify(info))
  await ctx.close()
})
