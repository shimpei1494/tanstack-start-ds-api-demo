import { test, expect } from '@playwright/test';

// The dedicated test DB is migrated before running this suite.
test('TODO CRUD survives reload, filters live in URL, candidates save only when adopted', async ({
  page,
}) => {
  const title = `確認用TODO ${Date.now()}`;
  await page.goto('/todos');
  await page.getByLabel('新しいTODO', { exact: true }).fill(title);
  await page.getByRole('button', { name: '追加', exact: true }).click();
  let row = page.getByTestId('todo-row').filter({ hasText: title });
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();
  await row.getByLabel(`${title}を編集`, { exact: true }).click();
  const edited = `${title} 編集済み`;
  await page.getByLabel('TODOのタイトルを編集').fill(edited);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  row = page.getByTestId('todo-row').filter({ hasText: edited });
  await expect(row).toContainText(edited);
  await row.getByRole('checkbox').click();
  await expect(row.getByRole('checkbox')).toBeChecked();
  await page
    .getByRole('navigation', { name: 'TODOの絞り込み' })
    .getByRole('link', { name: '完了', exact: true })
    .click();
  await expect(page).toHaveURL(/filter=completed/);
  await expect(row).toBeVisible();
  await page
    .getByRole('navigation', { name: 'TODOの絞り込み' })
    .getByRole('link', { name: '未完了', exact: true })
    .click();
  await expect(page).toHaveURL(/filter=active/);
  await expect(row).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'TODOの絞り込み' })
    .getByRole('link', { name: 'すべて', exact: true })
    .click();
  await page.getByLabel('何を進めたいですか？').fill('社内勉強会を準備したい');
  const before = await page.getByTestId('todo-row').count();
  await page.getByRole('button', { name: 'TODOを提案してもらう' }).click();
  const candidates = page.getByRole('button', { name: /をTODOに追加$/ });
  await expect(candidates.first()).toBeVisible();
  expect(await page.getByTestId('todo-row').count()).toBe(before);
  await candidates.first().click();
  await expect(page.getByTestId('todo-row')).toHaveCount(before + 1);
  await expect(candidates.first()).toBeDisabled();
  await row.getByLabel(`${edited}を削除`, { exact: true }).click();
  await expect(row).toHaveCount(0);
});

test('suggestion failures are visible and recover without changing TODOs', async ({ page }) => {
  await page.goto('/todos');
  await page.getByLabel('何を進めたいですか？').fill('[error]');
  await page.getByRole('button', { name: 'TODOを提案してもらう' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('何を進めたいですか？').fill('勉強会');
  await page.getByRole('button', { name: 'TODOを提案してもらう' }).click();
  await expect(page.getByRole('button', { name: /をTODOに追加$/ }).first()).toBeVisible();
});

test('chat streams before completion, regenerates, stops, resets and shows stream errors', async ({
  page,
}) => {
  await page.goto('/chat');
  await page.getByLabel('メッセージ', { exact: true }).fill('今週の作業を整理したい');
  await page.getByRole('button', { name: 'メッセージを送信' }).click();
  const assistant = page.getByTestId('message-assistant');
  await expect(assistant.first()).toBeVisible();
  await expect(assistant.first().locator('.message-text')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: '生成を停止' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'メッセージを送信' })).toBeVisible();
  await page.getByRole('button', { name: 'もう一度生成', exact: true }).click();
  await expect(page.getByRole('button', { name: '生成を停止' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'メッセージを送信' })).toBeVisible();
  await page.getByLabel('メッセージ', { exact: true }).fill('[slow] 次の一歩');
  await page.getByRole('button', { name: 'メッセージを送信' }).click();
  await page.getByRole('button', { name: '生成を停止' }).click();
  await expect(page.getByText('生成を停止しました。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '会話をリセット' }).click();
  await expect(page.getByTestId('message-user')).toHaveCount(0);
  await page.getByLabel('メッセージ', { exact: true }).fill('[stream-error]');
  await page.getByRole('button', { name: 'メッセージを送信' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'メッセージを送信' })).toBeVisible();
});

test('layout fits mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/todos');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page
    .getByRole('navigation', { name: 'メインナビゲーション' })
    .getByRole('link', { name: 'AIと考える' })
    .click();
  await expect(page.getByLabel('メッセージ', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const scenario of ['[error]', '[disconnect]']) {
  test(`chat recovers from ${scenario}`, async ({ page }) => {
    await page.goto('/chat');
    await page.getByLabel('メッセージ', { exact: true }).fill(scenario);
    await page.getByRole('button', { name: 'メッセージを送信' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成を停止' })).toHaveCount(0);
    await page.getByRole('button', { name: '会話をリセット' }).click();
    await page.getByLabel('メッセージ', { exact: true }).fill('次の一歩を考えたい');
    await page.getByRole('button', { name: 'メッセージを送信' }).click();
    await expect(page.getByTestId('message-assistant').locator('.message-text')).not.toBeEmpty();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
