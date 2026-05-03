const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('http://127.0.0.1:5173/llm-screening', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /For Platform Screen/i }).click();
  await page.getByRole('combobox').click();
  await page.getByText('SaaS Screening').click();
  await page.getByRole('button', { name: /^Proceed$/i }).click();
  await page.waitForTimeout(1700);

  const slider = page.locator('[data-slot="slider"]').first();
  const input = page.locator('input[type="number"]').first();
  const before = await input.inputValue();
  const box = await slider.boundingBox();
  if (!box) throw new Error('Slider not found');

  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const after = await input.inputValue();
  console.log(JSON.stringify({ before, after, sliderBox: box }, null, 2));
  await page.screenshot({ path: 'output/playwright/platform-slider-drag.png' });
  await browser.close();
})();
