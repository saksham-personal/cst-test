const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('http://127.0.0.1:5173/criteria-analysis/scr_demo', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue to Questions/i }).click();
  await page.waitForTimeout(200);
  await page.getByRole('textbox', { name: /Type your answer/i }).first().fill('Yes, it does');
  await page.getByRole('button', { name: /Generate Final Criteria/i }).click();
  await page.waitForTimeout(2300);
  await page.getByRole('button', { name: /Generate Keywords/i }).click();
  await page.waitForTimeout(1800);
  console.log('url=' + page.url());
  const keywordValues = await page.locator('input[placeholder="Enter keyword or phrase…"]').evaluateAll((els) => els.map((el) => el.value));
  const query = await page.locator('input[placeholder="e.g. (1 AND 2) OR 3"]').inputValue();
  console.log(JSON.stringify({ keywordValues, query }, null, 2));
  await page.screenshot({ path: 'output/playwright/generate-keywords-search-flow.png' });
  await browser.close();
})();
