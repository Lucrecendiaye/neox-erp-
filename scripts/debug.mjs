import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('https://neox-erp-alpha.vercel.app/register', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));

  console.log('=== PAGE TEXT ===');
  console.log(await page.evaluate(() => document.body.innerText.substring(0, 500)));
  console.log('=== URL ===');
  console.log(page.url());

  const hasError = await page.locator('text=Erreur').isVisible().catch(() => false);
  console.log('Has error:', hasError);

  if (hasError) {
    await page.locator('button:has-text("Réessayer")').click();
    await new Promise(r => setTimeout(r, 5000));
    console.log('=== AFTER RETRY ===');
    console.log(await page.evaluate(() => document.body.innerText.substring(0, 500)));
    console.log('URL:', page.url());
  }

  await browser.close();
}

main().catch(console.error);
