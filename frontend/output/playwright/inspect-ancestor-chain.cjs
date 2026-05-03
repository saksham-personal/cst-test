const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1668, height: 235 } });
  await page.goto('http://127.0.0.1:5173/criteria-analysis', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Continue to Questions/i }).click();
  await page.waitForTimeout(700);

  const data = await page.evaluate(() => {
    const textarea = document.querySelector('textarea[placeholder*="Type your answer"]');
    const question = Array.from(document.querySelectorAll('p')).find((el) =>
      el.textContent?.trim() === 'Does the company provide ISO 27001 certification services?'
    );
    const blockerButton = textarea?.parentElement?.querySelector('button');

    const rect = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    const chain = [];
    let node = textarea;
    while (node) {
      const style = window.getComputedStyle(node);
      chain.push({
        tag: node.tagName,
        className: node.className,
        id: node.id,
        top: node.getBoundingClientRect().top,
        bottom: node.getBoundingClientRect().bottom,
        height: node.getBoundingClientRect().height,
        scrollTop: 'scrollTop' in node ? node.scrollTop : null,
        scrollHeight: 'scrollHeight' in node ? node.scrollHeight : null,
        clientHeight: 'clientHeight' in node ? node.clientHeight : null,
        overflowY: style.overflowY,
        position: style.position,
      });
      node = node.parentElement;
    }

    return {
      windowScrollY: window.scrollY,
      textarea: rect(textarea),
      blocker: rect(blockerButton),
      question: rect(question),
      chain,
    };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
