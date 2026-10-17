import type { DsClient } from '@demo/ds-client';
import type { WorkReportDto, WorkReportRequest } from '../../contracts/reports';
import { workReportRequestSchema } from '../../contracts/reports';
import { ApplicationError } from './errors';
import type { ReportRepository } from './report-repository';

export function createReportService(
  repository: ReportRepository,
  client: Pick<DsClient, 'createWorkReport'>,
  now: () => Date = () => new Date(),
) {
  return {
    async generate(input: WorkReportRequest, signal?: AbortSignal): Promise<WorkReportDto> {
      const parsed = workReportRequestSchema.safeParse(input);
      if (!parsed.success) throw new ApplicationError('INVALID_INPUT', 'Invalid report request');
      signal?.throwIfAborted();
      const snapshot = await repository.snapshot();
      signal?.throwIfAborted();
      // This read is complete before waiting for DS. No transaction spans a
      // network request, and the full TODO collection is never sent to DS.
      const nextTodos = snapshot.nextTodos.slice(0, 3).map(({ id, title }) => ({ id, title }));
      const result = await client.createWorkReport(
        {
          total: snapshot.total,
          completed: snapshot.completed,
          next_todos: nextTodos,
          scenario: parsed.data.scenario,
        },
        signal,
      );
      return {
        total: snapshot.total,
        completed: snapshot.completed,
        remaining: snapshot.total - snapshot.completed,
        nextTodos,
        summary: result.summary,
        nextSteps: result.next_steps,
        modelVersion: result.model_version,
        generatedAt: now().toISOString(),
      };
    },
  };
}
