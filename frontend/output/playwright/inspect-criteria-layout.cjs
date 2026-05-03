const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1668, height: 235 } });
  await page.goto('http://127.0.0.1:5173/criteria-analysis', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue to Questions/i }).click();
  await page.waitForTimeout(700);

  const data = await page.evaluate(() => {
    const findByText = (selector, text) => Array.from(document.querySelectorAll(selector)).find((el) => el.textContent?.includes(text));
    const header = findByText('span, h1, p, button, div', 'Questions to be Answered');
    const item = header?.closest('[data-slot="accordion-item"]');
    const panel = item?.querySelector('[data-slot="accordion-content"]');
    const panelInner = panel?.firstElementChild;
    const question = findByText('p', 'Does the company provide ISO 27001 certification services?');
    const scrollContainer = item?.closest('.overflow-auto');
    const textarea = document.querySelector('textarea[placeholder*="Type your answer"]');

    const rect = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    return {
      windowScrollY: window.scrollY,
      scrollTop: scrollContainer ? scrollContainer.scrollTop : null,
      scrollHeight: scrollContainer ? scrollContainer.scrollHeight : null,
      clientHeight: scrollContainer ? scrollContainer.clientHeight : null,
      itemRect: rect(item),
      headerRect: rect(header),
      panelRect: rect(panel),
      panelInnerRect: rect(panelInner),
      questionRect: rect(question),
      textareaRect: rect(textarea),
      itemClasses: item?.className || null,
      panelInnerClasses: panelInner?.className || null,
    };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
