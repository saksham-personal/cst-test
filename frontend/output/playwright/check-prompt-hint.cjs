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

  const promptCard = page.locator('div.group').filter({ has: page.getByText('YES') }).first();
  await promptCard.dblclick();
  await page.waitForTimeout(250);
  const hintCount = await promptCard.getByText('dbl-click to edit').count();
  console.log(JSON.stringify({ hintCount }, null, 2));

  await page.screenshot({ path: 'output/playwright/prompt-inline-edit-mode.png' });
  await browser.close();
})();
