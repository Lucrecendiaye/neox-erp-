import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));

  await page.goto('https://neox-erp-alpha.vercel.app/register', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 3000));

  const errBtn = page.locator('button:has-text("Réessayer")');
  if (await errBtn.isVisible().catch(() => false)) {
    console.log('Error page, clicking Retry...');
    await errBtn.click();
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('Filling form...');
  await page.locator('[placeholder="Votre nom"]').fill('Admin Boutique');
  console.log('Name filled');
  await page.locator('[placeholder="email@exemple.com"]').fill('admin@boutique.com');
  console.log('Email filled');
  await page.locator('[placeholder="+226 XX XX XX"]').fill('+22670123456');
  console.log('Phone filled');
  
  const pwdFields = page.locator('[placeholder="••••••••"]');
  const count = await pwdFields.count();
  console.log('Password fields count:', count);
  await pwdFields.nth(0).fill('admin123');
  console.log('Password 1 filled');
  await pwdFields.nth(1).fill('admin123');
  console.log('Password 2 filled');

  // Try clicking the button
  const btn = page.locator('button:has-text("Créer mon compte")');
  console.log('Button visible:', await btn.isVisible());
  console.log('Button enabled:', await btn.isEnabled());
  
  await btn.click();
  await new Promise(r => setTimeout(r, 5000));

  console.log('Final URL:', page.url());
  console.log('Page text:', await page.evaluate(() => document.body.innerText.substring(0, 500)));

  await browser.close();
}

main().catch(console.error);
