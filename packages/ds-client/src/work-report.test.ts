import { describe, expect, it } from 'vitest';
import { workReportResponseSchema, type WorkReportInput } from '@demo/ds-contract';
import fixtures from '../../ds-contract/fixtures/scenarios.json';
import { createDsClient } from './index';

const todo = { id: '6c817ab8-0212-469c-aa82-624e6c7b55a1', title: '設計を確認する' };
const report: WorkReportInput = { total: 5, completed: 2, next_todos: [todo], scenario: 'normal' };
const modes = [
  { name: 'mock', options: { mode: 'mock' as const } },
  ...(process.env.DS_TEST_HTTP_URL
    ? [{ name: 'HTTP', options: { mode: 'http' as const, baseUrl: process.env.DS_TEST_HTTP_URL } }]
    : []),
];

describe.each(modes)('$name work report contract', ({ options }) => {
  it('returns the shared report rule and only the supplied next steps', async () => {
    const result = await createDsClient(options).createWorkReport(report);
    const rules = fixtures.work_report;
    expect(workReportResponseSchema.parse(result)).toEqual({
      summary: rules.summary_template
        .replace('{total}', '5')
        .replace('{completed}', '2')
        .replace('{remaining}', '3'),
      next_steps: [rules.next_step_prefix + todo.title + rules.next_step_suffix],
      model_version: fixtures.model_version,
    });
  });
  it('accepts an empty TODO snapshot and an all-completed snapshot', async () => {
    const client = createDsClient(options);
    expect(
      await client.createWorkReport({ total: 0, completed: 0, next_todos: [], scenario: 'normal' }),
    ).toEqual({
      summary: fixtures.work_report.zero_summary,
      next_steps: [],
      model_version: fixtures.model_version,
    });
    const completed = await client.createWorkReport({
      total: 2,
      completed: 2,
      next_todos: [],
      scenario: 'normal',
    });
    expect(completed.next_steps).toEqual([]);
    expect(completed.summary).toContain('残り0件');
  });
  it('keeps report output bounded for a 200-code-point title', async () => {
    const result = await createDsClient(options).createWorkReport({
      ...report,
      next_todos: [{ ...todo, title: '😀'.repeat(200) }],
    });
    expect(workReportResponseSchema.safeParse(result).success).toBe(true);
    expect(Array.from(result.next_steps[0]).length).toBeLessThanOrEqual(200);
  });
  it('keeps slow reports pending for three seconds before success', async () => {
    const started = Date.now();
    const result = await createDsClient(options).createWorkReport({ ...report, scenario: 'slow' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
    expect(result.summary).toContain('全5件');
  });
  it('keeps error reports pending before exposing a safe service error', async () => {
    const started = Date.now();
    await expect(
      createDsClient(options).createWorkReport({ ...report, scenario: 'error' }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
  });
  it.each([
    { ...report, total: -1 },
    { ...report, total: 1.5 },
    { ...report, completed: 6 },
    { ...report, total: 2, completed: 2 },
    { ...report, next_todos: [todo, todo] },
    { ...report, next_todos: [{ ...todo, id: 'invalid' }] },
    { ...report, next_todos: [{ ...todo, title: ' ' }] },
    { ...report, next_todos: [{ ...todo, title: 'x'.repeat(201) }] },
    { ...report, next_todos: Array.from({ length: 4 }, () => todo) },
  ])('rejects invalid counts or TODO data before external calls', async (invalid) => {
    await expect(createDsClient(options).createWorkReport(invalid)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
  it('cancels an in-flight slow report without waiting for its timer', async () => {
    const signal = new AbortController();
    const pending = createDsClient(options).createWorkReport(
      { ...report, scenario: 'slow' },
      signal.signal,
    );
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const started = Date.now();
    signal.abort();
    await rejected;
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it('times out slow reports and honors an already aborted signal', async () => {
    const client = createDsClient({ ...options, timeoutMs: 40 });
    await expect(client.createWorkReport({ ...report, scenario: 'slow' })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await expect(client.createWorkReport(report, AbortSignal.abort())).rejects.toMatchObject({
      code: 'ABORTED',
    });
  });
});
