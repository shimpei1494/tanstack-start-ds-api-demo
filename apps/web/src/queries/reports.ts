import type { ReportScenario } from '@demo/ds-contract';
import { queryOptions } from '@tanstack/react-query';
import { getWorkReportFn } from '../server/functions/reports';
import { unwrap } from './todos';

export const reportKeys = {
  all: ['reports'] as const,
  summary: (scenario: ReportScenario) => ['reports', 'summary', scenario] as const,
};

export const reportQueryOptions = (scenario: ReportScenario) =>
  queryOptions({
    queryKey: reportKeys.summary(scenario),
    queryFn: async ({ signal }) => unwrap(await getWorkReportFn({ data: { scenario }, signal })),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
