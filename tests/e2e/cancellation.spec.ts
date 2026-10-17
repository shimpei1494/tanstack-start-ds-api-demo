import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

interface ObservedRun {
  runId: string;
  events: string[];
  startedAtMs: number;
  finishedAtMs: number | null;
  completed: boolean;
  cancelled: boolean;
}

const probeUrl = process.env.DS_PROBE_URL ?? 'http://127.0.0.1:8101';

test.describe('browser → Start → Python cancellation', () => {
  test.skip(
    process.env.DS_MODE !== 'http',
    'Requires the test-only Python probe server in HTTP mode.',
  );

  for (const action of ['stop', 'disconnect'] as const) {
    test(`${action} closes the real Python generator before the slow operation finishes`, async ({
      page,
      request,
    }) => {
      const marker = `cancel-e2e-${randomUUID()}`;
      const readRuns = async (): Promise<ObservedRun[]> => {
        const response = await request.get(`${probeUrl}/__test/runs`, { params: { marker } });
        expect(response.ok()).toBe(true);
        return ((await response.json()) as { runs: ObservedRun[] }).runs;
      };

      await page.goto('/chat');
      await page.getByLabel('メッセージ', { exact: true }).fill(`[slow] ${marker}`);
      await page.getByRole('button', { name: 'メッセージを送信' }).click();
      await expect(page.getByRole('button', { name: '生成を停止' })).toBeVisible();

      // Wait until the real DS generator has yielded its step and entered the
      // five-second await. This rules out cancelling only a local UI request.
      await expect
        .poll(
          async () => {
            const [run] = await readRuns();
            return run?.events.includes('STEP_STARTED') && run.finishedAtMs === null;
          },
          { timeout: 3000, intervals: [25, 50, 100] },
        )
        .toBe(true);

      const cancelledAt = Date.now();
      if (action === 'stop') await page.getByRole('button', { name: '生成を停止' }).click();
      else await page.goto('about:blank');

      await expect
        .poll(
          async () => {
            const [run] = await readRuns();
            return run !== undefined && run.finishedAtMs !== null;
          },
          { timeout: 1800, intervals: [25, 50, 100] },
        )
        .toBe(true);
      expect(Date.now() - cancelledAt).toBeLessThan(2000);

      const runs = await readRuns();
      expect(runs).toHaveLength(1);
      const run = runs[0]!;
      expect(run.completed).toBe(false);
      expect(run.events).not.toContain('RUN_FINISHED');
      expect(run.finishedAtMs).not.toBeNull();
      expect(run.finishedAtMs! - run.startedAtMs).toBeLessThan(4500);
    });
  }
});
