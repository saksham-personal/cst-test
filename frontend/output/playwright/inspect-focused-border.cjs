const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1668, height: 260, deviceScaleFactor: 1 } });
  await page.goto('http://127.0.0.1:5173/criteria-analysis', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue to Questions/i }).click();
  await page.waitForTimeout(700);
  const textarea = page.locator('#criteria-first-question-row textarea');
  await textarea.focus();
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'output/playwright/criteria-border-focused.png' });
  const data = await textarea.evaluate((el) => {
    const s = window.getComputedStyle(el);
    return {
      borderColor: s.borderColor,
      borderWidth: s.borderWidth,
      boxShadow: s.boxShadow,
      outline: s.outline,
    };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
