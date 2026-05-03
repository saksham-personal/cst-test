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

  const expandButton = page.locator('button[title="Expand Editor"]').first();
  const box = await expandButton.boundingBox();
  console.log(JSON.stringify({ buttonBox: box }, null, 2));
  if (!box) throw new Error('No expand button box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
  const popupCount = await page.locator('[data-slot="dialog-content"]').count();
  const titles = await page.locator('[data-slot="dialog-title"]').allTextContents();
  console.log(JSON.stringify({ popupCount, titles }, null, 2));
  await page.screenshot({ path: 'output/playwright/dialog-open-manual-click.png' });
  await browser.close();
})();
