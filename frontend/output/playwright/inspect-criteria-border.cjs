const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1668, height: 235, deviceScaleFactor: 1 } });
  await page.goto('http://127.0.0.1:5173/criteria-analysis', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue to Questions/i }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'output/playwright/criteria-border-current.png' });

  const data = await page.evaluate(() => {
    const textarea = document.querySelector('textarea[placeholder*="Type your answer"]');
    if (!(textarea instanceof HTMLTextAreaElement)) return null;
    const style = window.getComputedStyle(textarea);
    return {
      className: textarea.className,
      borderTop: style.borderTop,
      borderRight: style.borderRight,
      borderBottom: style.borderBottom,
      borderLeft: style.borderLeft,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      outline: style.outline,
      backgroundColor: style.backgroundColor,
    };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
