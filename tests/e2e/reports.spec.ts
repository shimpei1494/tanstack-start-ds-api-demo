import { expect, test } from '@playwright/test';

const result = '[data-testid="work-report-result"]';

test('report streams its shell before DS completes and retains results while refreshing', async ({
  page,
}) => {
  await page.goto('/reports?scenario=slow', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'ここまでを、振り返ろう。' })).toBeVisible();
  await expect(page.getByTestId('report-pending')).toBeVisible();
  await expect(page.getByRole('link', { name: 'すぐに振り返る', exact: true })).toBeVisible();
  await expect(page.locator(result)).toBeVisible();
  const previous = await page.getByTestId('report-generated-at').getAttribute('datetime');
  const total = await page.getByTestId('report-count-total').textContent();
  await page.getByRole('button', { name: '再集計', exact: true }).click();
  await expect(page.getByTestId('report-pending')).toHaveCount(0);
  await expect(page.locator(result)).toBeVisible();
  await expect(page.getByTestId('report-count-total')).toHaveText(total!);
  await expect(page.getByRole('button', { name: '再集計', exact: true })).toBeDisabled();
  await expect(page.getByTestId('report-generated-at')).not.toHaveAttribute('datetime', previous!);
  await expect(page.getByRole('button', { name: '再集計', exact: true })).toBeEnabled();
});

test('first-load failure is local, retryable, and recovers by selecting normal response', async ({
  page,
}) => {
  await page.goto('/reports?scenario=error', { waitUntil: 'commit' });
  await expect(page.getByRole('heading', { name: 'ここまでを、振り返ろう。' })).toBeVisible();
  const retry = page.getByRole('button', { name: 'もう一度試す', exact: true });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible();
  await retry.click();
  await expect(page.getByTestId('report-pending')).toBeVisible();
  await expect(retry).toBeVisible();
  await page.getByRole('link', { name: 'すぐに振り返る', exact: true }).click();
  await expect(page.locator(result)).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test('failed background refresh preserves last report and can be retried', async ({ page }) => {
  await page.goto('/reports?scenario=normal');
  await expect(page.locator(result)).toBeVisible();
  const previous = await page.getByTestId('report-generated-at').getAttribute('datetime');
  // After the initial report, this page only calls a Server Function for refresh.
  await page.route('**/_serverFn/**', (route) => route.abort('failed'));
  await page.getByRole('button', { name: '再集計', exact: true }).click();
  await expect(page.locator(result)).toBeVisible();
  await expect(page.locator(result).getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('report-generated-at')).toHaveAttribute('datetime', previous!);
  await page.unroute('**/_serverFn/**');
  await page.getByRole('button', { name: '再集計', exact: true }).click();
  await expect(page.locator(result).getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('report-generated-at')).not.toHaveAttribute('datetime', previous!);
});

test('TODO writes invalidate report cache across SPA navigation and mobile layout fits', async ({
  page,
}) => {
  const title = `report cache ${Date.now()}`;
  await page.goto('/reports?scenario=slow');
  await expect(page.locator(result)).toBeVisible();
  const before = parseInt((await page.getByTestId('report-count-total').textContent())!, 10);
  const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
  await navigation.getByRole('link', { name: 'やること', exact: true }).click();
  await page.getByLabel('新しいTODO', { exact: true }).fill(title);
  await page.getByRole('button', { name: '追加', exact: true }).click();
  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toBeVisible();
  await navigation.getByRole('link', { name: '振り返る', exact: true }).click();
  await expect(page.getByTestId('report-count-total')).toHaveText(`${before + 1}件`);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: '再集計', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'やること', exact: true }).click();
  await page.getByLabel(`${title}を削除`, { exact: true }).click();
  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toHaveCount(0);
});

test('SSR sends pending HTML before the completed report', async () => {
  const started = performance.now();
  const response = await fetch('http://127.0.0.1:3101/reports?scenario=slow', {
    headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36' },
  });
  expect(response.ok).toBe(true);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let pendingAt: number | undefined;
  let resultAt: number | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (pendingAt === undefined && html.includes('data-testid="report-pending"'))
        pendingAt = performance.now() - started;
      if (resultAt === undefined && html.includes('data-testid="work-report-result"'))
        resultAt = performance.now() - started;
    }
  } finally {
    await reader.cancel();
  }
  expect(html).toContain('ここまでを、振り返ろう');
  expect(pendingAt).toBeDefined();
  expect(resultAt).toBeDefined();
  expect(pendingAt!).toBeLessThan(2500);
  expect(resultAt!).toBeGreaterThanOrEqual(2800);
  expect(resultAt! - pendingAt!).toBeGreaterThan(2000);
});
