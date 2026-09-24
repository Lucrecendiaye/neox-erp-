import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { tryRegisterAndLogin } from './helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.join(__dirname, '.auth-state.json')

export async function globalSetup() {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE)
}

export default async function () {
  await globalSetup()
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()

  let page: any = null
  let email = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    email = `mobile-${Date.now()}-${attempt}@example.com`
    const newPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page = await tryRegisterAndLogin(newPage, email)
    if (page.url() === 'http://localhost:3000/') break
    console.log(`[setup] attempt ${attempt} failed, url=${page.url()}`)
    await page.close()
    page = null
  }

  if (!page || page.url() !== 'http://localhost:3000/') {
    throw new Error('[setup] could not authenticate')
  }

  await page.context().storageState({ path: STATE_FILE })
  console.log(`[setup] registered ${email} -> ${STATE_FILE}`)
  await browser.close()
}
