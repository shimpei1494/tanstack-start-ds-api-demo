import { createFileRoute } from '@tanstack/react-router';
import { TodoPage } from '../features/todos/todo-page';
import { todosQueryOptions, type TodoFilter } from '../queries/todos';

export const Route = createFileRoute('/todos')({
  validateSearch: (search: Record<string, unknown>): { filter: TodoFilter } => ({
    filter: search.filter === 'active' || search.filter === 'completed' ? search.filter : 'all',
  }),
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(todosQueryOptions(deps.filter)),
  pendingComponent: () => <output className="page-loading">やることを読み込み中…</output>,
  errorComponent: ({ reset }) => (
    <div className="route-message">
      <h1>やることを読み込めませんでした</h1>
      <p>データベースへの接続を確認してください。</p>
      <button onClick={reset}>再試行</button>
    </div>
  ),
  component: TodoPage,
});
