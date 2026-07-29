import { test, expect } from '@playwright/test';

test('Should display the main page title', async ({ page }) => {
  // Navigate to the application home page
  await page.goto('/');
   
  // Wait for navigation to complete
  await page.waitForURL('/');
   
  // Take a screenshot for verification
  await page.screenshot({ path: 'screenshots/main-page.png' });
   
  // Verify the title contains "NeoX ERP"
  const title = await page.title();
  expect(title).toContain('NeoX ERP');
});