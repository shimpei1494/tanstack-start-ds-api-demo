import { describe, expect, it, vi } from 'vitest';
import { createReportService } from './reports';
import { publicResult } from './errors';

const first = { id: '00000000-0000-4000-8000-000000000001', title: 'Next task' };
const response = {
  summary: 'Report summary',
  next_steps: ['A small next step'],
  model_version: 'test-report-v1',
};

describe('work report use case', () => {
  it('sends only aggregate counts and at most three pending ids/titles, and returns a public DTO', async () => {
    const repository = {
      snapshot: vi.fn().mockResolvedValue({
        total: 20,
        completed: 4,
        nextTodos: Array.from({ length: 5 }, (_, index) => ({
          ...first,
          id: `id-${index}`,
          privateMetadata: 'secret',
        })),
        privateCompletedTitles: ['must not leave Start'],
      }),
    };
    const client = { createWorkReport: vi.fn().mockResolvedValue(response) };
    const signal = new AbortController().signal;
    const result = await createReportService(
      repository,
      client,
      () => new Date('2026-10-18T00:00:00Z'),
    ).generate({ scenario: 'normal' }, signal);
    const expectedTodos = [0, 1, 2].map((index) => ({ id: `id-${index}`, title: first.title }));
    expect(client.createWorkReport).toHaveBeenCalledExactlyOnceWith(
      {
        total: 20,
        completed: 4,
        next_todos: expectedTodos,
        scenario: 'normal',
      },
      signal,
    );
    expect(result).toEqual({
      total: 20,
      completed: 4,
      remaining: 16,
      nextTodos: expectedTodos,
      summary: response.summary,
      nextSteps: response.next_steps,
      modelVersion: response.model_version,
      generatedAt: '2026-10-18T00:00:00.000Z',
    });
    expect(JSON.stringify(client.createWorkReport.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('handles an empty database without synthesizing pending TODOs', async () => {
    const repository = {
      snapshot: vi.fn().mockResolvedValue({ total: 0, completed: 0, nextTodos: [] }),
    };
    const client = { createWorkReport: vi.fn().mockResolvedValue(response) };
    const result = await createReportService(repository, client).generate({ scenario: 'slow' });
    expect(result).toMatchObject({ total: 0, completed: 0, remaining: 0, nextTodos: [] });
    expect(client.createWorkReport).toHaveBeenCalledWith(
      { total: 0, completed: 0, next_todos: [], scenario: 'slow' },
      undefined,
    );
  });

  it('waits for the DB snapshot before starting DS and forwards the same abort signal', async () => {
    let snapshotReady = false;
    const repository = {
      snapshot: vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        snapshotReady = true;
        return { total: 1, completed: 0, nextTodos: [first] };
      }),
    };
    const signal = new AbortController().signal;
    const client = {
      createWorkReport: vi.fn().mockImplementation(async (_input, passedSignal) => {
        expect(snapshotReady).toBe(true);
        expect(passedSignal).toBe(signal);
        return response;
      }),
    };
    await createReportService(repository, client).generate({ scenario: 'normal' }, signal);
  });

  it('rejects invalid scenarios before reading the DB or calling DS', async () => {
    const repository = { snapshot: vi.fn() };
    const client = { createWorkReport: vi.fn() };
    const result = await publicResult(() =>
      createReportService(repository, client).generate({ scenario: 'invalid' as 'normal' }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(repository.snapshot).not.toHaveBeenCalled();
    expect(client.createWorkReport).not.toHaveBeenCalled();
  });

  it('does not start an operation that was already cancelled', async () => {
    const repository = { snapshot: vi.fn() };
    const client = { createWorkReport: vi.fn() };
    const controller = new AbortController();
    controller.abort();
    await expect(
      createReportService(repository, client).generate({ scenario: 'normal' }, controller.signal),
    ).rejects.toThrow();
    expect(repository.snapshot).not.toHaveBeenCalled();
    expect(client.createWorkReport).not.toHaveBeenCalled();
  });

  it('does not call DS if cancellation occurs during the DB read', async () => {
    const controller = new AbortController();
    const repository = {
      snapshot: vi.fn().mockImplementation(async () => {
        controller.abort();
        return { total: 0, completed: 0, nextTodos: [] };
      }),
    };
    const client = { createWorkReport: vi.fn() };
    await expect(
      createReportService(repository, client).generate({ scenario: 'normal' }, controller.signal),
    ).rejects.toThrow();
    expect(client.createWorkReport).not.toHaveBeenCalled();
  });

  it('converts DS and DB failures to safe public errors', async () => {
    const repository = {
      snapshot: vi.fn().mockResolvedValue({ total: 0, completed: 0, nextTodos: [] }),
    };
    const client = {
      createWorkReport: vi.fn().mockRejectedValue(
        Object.assign(new Error('private upstream details'), {
          name: 'DsError',
          code: 'UNAVAILABLE',
        }),
      ),
    };
    const service = createReportService(repository, client);
    expect(await publicResult(() => service.generate({ scenario: 'error' }))).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
    repository.snapshot.mockRejectedValue(new Error('postgresql://private-credentials'));
    const dbFailure = await publicResult(() => service.generate({ scenario: 'normal' }));
    expect(dbFailure).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(JSON.stringify(dbFailure)).not.toContain('credentials');
  });
});
