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
  const buttonBox = await expandButton.boundingBox();
  if (!buttonBox) throw new Error('No expand button box');
  await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
  await page.waitForTimeout(500);
  const dialog = page.locator('[data-slot="dialog-content"]').first();
  const isVisible = await dialog.isVisible().catch(() => false);
  const dialogBox = isVisible ? await dialog.boundingBox() : null;
  const titleTexts = await page.locator('[data-slot="dialog-title"]').allTextContents();
  const viewport = page.viewportSize();
  console.log(JSON.stringify({ isVisible, dialogBox, titleTexts, viewport }, null, 2));
  await page.screenshot({ path: 'output/playwright/prompt-dialog-open.png' });
  await browser.close();
})();
