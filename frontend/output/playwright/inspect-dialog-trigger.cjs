const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1822, height: 923 } });
  await page.goto('http://127.0.0.1:5173/llm-screening', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /For Platform Screen/i }).click();
  await page.getByRole('combobox').click();
  await page.getByText('SaaS Screening').click();
  await page.getByRole('button', { name: /^Proceed$/i }).click();
  await page.waitForTimeout(1700);
  const html = await page.content();
  console.log(html.includes('Edit Yes Prompt') ? 'HAS_EDIT_DIALOG_TEXT' : 'NO_EDIT_DIALOG_TEXT');
  const buttons = await page.locator('button[title="Expand Editor"]').count();
  console.log('expandButtons=' + buttons);
  await browser.close();
})();
