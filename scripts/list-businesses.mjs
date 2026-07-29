import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));
  page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));

  let navigated = false;
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log('NAVIGATED TO:', frame.url());
    }
  });

  await page.goto('https://neox-erp-alpha.vercel.app/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('goto error:', e.message));

  await new Promise(r => setTimeout(r, 20000));

  console.log('FINAL_URL:', page.url());

  // Check for retry button
  const hasRetry = await page.locator('button').filter({ hasText: 'Réessayer' }).count();
  console.log('RETRY BUTTONS:', hasRetry);

  const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300)).catch(() => 'NO BODY');
  console.log('BODY:', bodyText);

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
