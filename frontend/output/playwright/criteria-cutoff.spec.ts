import { test } from '@playwright/test';

test('criteria analysis blocker icon layout', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/criteria-analysis');
  await page.getByRole('button', { name: /Continue to Questions/i }).click();
  await page.waitForTimeout(700);

  const data = await page.evaluate(() => {
    const questionText = Array.from(document.querySelectorAll('p')).find((el) =>
      el.textContent?.includes('Does the company provide ISO 27001 certification services?')
    );
    const textarea = document.querySelector('textarea[placeholder*="Type your answer"]');
    const blockerButton = textarea?.parentElement?.querySelector('button');
    const asRect = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    return {
      windowScrollY: window.scrollY,
      questionRect: asRect(questionText),
      textareaRect: asRect(textarea),
      blockerRect: asRect(blockerButton),
    };
  });

  console.log(JSON.stringify(data, null, 2));
  await page.screenshot({ path: 'output/playwright/criteria-cutoff-current.png' });
});
