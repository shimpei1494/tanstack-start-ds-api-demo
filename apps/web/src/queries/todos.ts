import { queryOptions } from '@tanstack/react-query';
import { listTodosFn } from '../server/functions/todos';

export type TodoFilter = 'all' | 'active' | 'completed';
export const todoKeys = {
  all: ['todos'] as const,
  list: (filter: TodoFilter) => ['todos', filter] as const,
};
export const todosQueryOptions = (filter: TodoFilter) =>
  queryOptions({
    queryKey: todoKeys.list(filter),
    queryFn: () => listTodosFn({ data: { filter } }),
    staleTime: 15_000,
  });

export function unwrap<T>(
  result: { ok: true; data: T } | { ok: false; error: { code: string; message: string } },
): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
