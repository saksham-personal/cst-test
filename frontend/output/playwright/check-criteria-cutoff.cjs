const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1668, height: 235 } });
  await page.goto('http://127.0.0.1:5173/criteria-analysis', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue to Questions/i }).click();
  await page.waitForTimeout(700);

  const data = await page.evaluate(() => {
    const textarea = document.querySelector('textarea[placeholder*="Type your answer"]');
    const blockerButton = textarea?.parentElement?.querySelector('button');
    const questionText = Array.from(document.querySelectorAll('p')).find((el) =>
      el.textContent?.includes('Does the company provide ISO 27001 certification services?')
    );
    const rect = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    return {
      scrollY: window.scrollY,
      textarea: rect(textarea),
      blocker: rect(blockerButton),
      question: rect(questionText),
    };
  });

  console.log(JSON.stringify(data));
  await page.screenshot({ path: 'output/playwright/criteria-cutoff-after-fix.png' });
  await browser.close();
})();
