import { reportScenarioSchema } from '@demo/ds-contract';
import { createFileRoute } from '@tanstack/react-router';
import { ReportPage } from '../features/reports/report-page';
import { reportQueryOptions } from '../queries/reports';

export const Route = createFileRoute('/reports')({
  validateSearch: (search: Record<string, unknown>) => ({
    scenario: reportScenarioSchema.catch('slow').parse(search.scenario),
  }),
  loaderDeps: ({ search }) => ({ scenario: search.scenario }),
  loader: ({ context, deps }) => {
    // Start fetching now; let the page shell and Suspense fallback render immediately.
    // prefetchQuery handles rejection, so the result boundary owns initial failures.
    void context.queryClient.prefetchQuery(reportQueryOptions(deps.scenario));
  },
  component: ReportPage,
});
