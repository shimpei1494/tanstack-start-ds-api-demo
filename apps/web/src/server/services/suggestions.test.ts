import { expect, it, vi } from 'vitest';
import { createSuggestionService } from './suggestions';

it('previews DS suggestions without a persistence dependency and passes cancellation through', async () => {
  const response = { suggestions: [{ title: 'Small next step' }], model_version: 'test' };
  const client = { suggestTodos: vi.fn().mockResolvedValue(response) };
  const controller = new AbortController();
  const result = await createSuggestionService(client).suggest(
    { goal: 'Finish the demo' },
    controller.signal,
  );
  expect(result).toEqual(response);
  expect(client.suggestTodos).toHaveBeenCalledWith({ goal: 'Finish the demo' }, controller.signal);
});
