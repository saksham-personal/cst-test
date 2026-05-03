const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('http://127.0.0.1:5173/search', { waitUntil: 'networkidle' });

  await page.evaluate(() => {
    const generatedKeywords = [
      { id: crypto.randomUUID(), keyword: 'ISO 27001 certification', mode: 'lexical', action: 'include', weight: 1, serial: 1 },
      { id: crypto.randomUUID(), keyword: 'certification body registrar', mode: 'lexical', action: 'include', weight: 1, serial: 2 },
      { id: crypto.randomUUID(), keyword: 'ISO audit services', mode: 'lexical', action: 'include', weight: 1, serial: 3 },
    ];
    window.history.pushState(
      { usr: { autoApplyKeywords: true, generatedKeywords, generatedQueryExpression: '1 OR 2 OR 3' }, key: 'criteria-test', idx: 2 },
      '',
      '/search'
    );
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });

  await page.waitForTimeout(150);
  await page.screenshot({ path: 'output/playwright/search-keyword-skeleton.png' });
  await page.waitForTimeout(1100);

  const keywordValues = await page.locator('input[placeholder="Enter keyword or phrase…"]').evaluateAll((els) => els.map((el) => el.value));
  const queryValue = await page.locator('input[placeholder="e.g. (1 AND 2) OR 3"]').inputValue();
  console.log(JSON.stringify({ keywordValues, queryValue }, null, 2));
  await page.screenshot({ path: 'output/playwright/search-keyword-applied.png' });
  await browser.close();
})();
