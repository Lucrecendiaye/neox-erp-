import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('https://neox-erp-alpha.vercel.app/register', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 3000));

  // Check for error
  const errBtn = page.locator('button:has-text("Réessayer")');
  if (await errBtn.isVisible().catch(() => false)) {
    console.log('Error page detected, clicking Retry...');
    await errBtn.click();
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('Filling form...');
  await page.locator('[placeholder="Votre nom"]').fill('Admin Boutique');
  await page.locator('[placeholder="email@exemple.com"]').fill('admin@boutique.com');
  await page.locator('[placeholder="+226 XX XX XX"]').fill('+22670123456');
  const pwdFields = page.locator('[placeholder="••••••••"]');
  await pwdFields.nth(0).fill('admin123');
  await pwdFields.nth(1).fill('admin123');

  await page.locator('button:has-text("Créer mon compte")').click();
  await new Promise(r => setTimeout(r, 5000));

  console.log('Final URL:', page.url());
  console.log('Page text:', await page.evaluate(() => document.body.innerText.substring(0, 500)));

  await browser.close();
}

main().catch(console.error);
