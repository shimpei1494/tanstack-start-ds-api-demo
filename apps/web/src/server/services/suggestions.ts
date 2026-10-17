import type { DsClient } from '@demo/ds-client';

/** Preview only: adopting a suggestion reuses the normal TODO create service. */
export function createSuggestionService(client: Pick<DsClient, 'suggestTodos'>) {
  return {
    suggest: (input: { goal: string }, signal?: AbortSignal) => client.suggestTodos(input, signal),
  };
}
