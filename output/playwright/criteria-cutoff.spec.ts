import { test } from '@playwright/test';

test('criteria analysis blocker icon layout', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/criteria-analysis');
  await page.getByRole('button', { name: /Continue to Questions/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'output/playwright/criteria-cutoff-current.png' });
});
