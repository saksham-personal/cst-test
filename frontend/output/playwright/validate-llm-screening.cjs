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

  const expandButton = page.locator('button[title="Expand Editor"]').first();
  const buttonBox = await expandButton.boundingBox();
  if (!buttonBox) throw new Error('Expand button not found');
  await page.mouse.click(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
  await page.waitForTimeout(500);

  const dialog = page.locator('[data-slot="dialog-content"]').first();
  const dialogVisible = await dialog.isVisible();
  const dialogBox = dialogVisible ? await dialog.boundingBox() : null;
  const viewport = page.viewportSize();

  if (dialogVisible) {
    await page.locator('[data-slot="dialog-close"]').first().click();
    await page.waitForTimeout(250);
  }

  const slider = page.locator('[data-slot="slider"]').first();
  const thumb = page.locator('[data-slot="slider-thumb"]').first();
  const batchInput = page.locator('input[type="number"]').first();
  const before = await batchInput.inputValue();
  const sliderBox = await slider.boundingBox();
  const thumbBox = await thumb.boundingBox();
  if (!sliderBox || !thumbBox) throw new Error('Slider or thumb not found');

  await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sliderBox.x + sliderBox.width - 2, thumbBox.y + thumbBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterDrag = await batchInput.inputValue();

  console.log(JSON.stringify({
    hintCount,
    dialogVisible,
    dialogWidth: dialogBox?.width ?? null,
    viewportWidth: viewport?.width ?? null,
    dialogWidthRatio: dialogBox && viewport ? Number((dialogBox.width / viewport.width).toFixed(3)) : null,
    before,
    afterDrag,
  }, null, 2));

  await page.screenshot({ path: 'output/playwright/llm-screening-validated.png' });
  await browser.close();
})();
