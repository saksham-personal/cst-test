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
  const thumb = page.locator('[data-slot="slider-thumb"]').first();
  const input = page.locator('input[type="number"]').first();
  const before = await input.inputValue();
  const sliderBox = await slider.boundingBox();
  const thumbBox = await thumb.boundingBox();
  if (!sliderBox || !thumbBox) throw new Error('Slider or thumb not found');

  await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sliderBox.x + sliderBox.width - 2, thumbBox.y + thumbBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const afterDrag = await input.inputValue();
  await page.mouse.click(sliderBox.x + sliderBox.width - 2, sliderBox.y + sliderBox.height / 2);
  await page.waitForTimeout(250);
  const afterClick = await input.inputValue();

  console.log(JSON.stringify({ before, afterDrag, afterClick, sliderBox, thumbBox }, null, 2));
  await browser.close();
})();
