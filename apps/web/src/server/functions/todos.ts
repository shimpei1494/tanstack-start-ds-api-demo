import { createServerFn } from '@tanstack/react-start';
import { suggestionInputSchema } from '@demo/ds-contract';
import type { z } from 'zod';
import {
  createTodoInputSchema,
  deleteTodoInputSchema,
  listTodosInputSchema,
  updateTodoInputSchema,
} from '../../contracts/todos';
import { ApplicationError, publicResult, toPublicError } from '../services/errors';

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ApplicationError('INVALID_INPUT', 'Invalid input');
  return parsed.data;
}

export const listTodosFn = createServerFn({ method: 'GET' })
  .validator((input: z.input<typeof listTodosInputSchema>) => input)
  .handler(async ({ data }) => {
    try {
      const input = validate(listTodosInputSchema, data);
      const { getTodoService } = await import('../dependencies/index.server');
      return await getTodoService().list(input.filter);
    } catch (error) {
      throw new Error(toPublicError(error).message);
    }
  });

export const createTodoFn = createServerFn({ method: 'POST' })
  .validator((input: z.input<typeof createTodoInputSchema>) => input)
  .handler(({ data }) =>
    publicResult(async () => {
      const input = validate(createTodoInputSchema, data);
      const { getTodoService } = await import('../dependencies/index.server');
      return getTodoService().create(input);
    }),
  );

export const updateTodoFn = createServerFn({ method: 'POST' })
  .validator((input: z.input<typeof updateTodoInputSchema>) => input)
  .handler(({ data }) =>
    publicResult(async () => {
      const input = validate(updateTodoInputSchema, data);
      const { getTodoService } = await import('../dependencies/index.server');
      return getTodoService().update(input);
    }),
  );

export const deleteTodoFn = createServerFn({ method: 'POST' })
  .validator((input: z.input<typeof deleteTodoInputSchema>) => input)
  .handler(({ data }) =>
    publicResult(async () => {
      const input = validate(deleteTodoInputSchema, data);
      const { getTodoService } = await import('../dependencies/index.server');
      return getTodoService().delete(input.id);
    }),
  );

export const suggestTodosFn = createServerFn({ method: 'POST' })
  .validator((input: z.input<typeof suggestionInputSchema>) => input)
  .handler(({ data }) =>
    publicResult(async () => {
      const input = validate(suggestionInputSchema, data);
      const { getDsServices } = await import('../dependencies/index.server');
      const { getRequest } = await import('@tanstack/react-start/server');
      return getDsServices().suggestions.suggest(input, getRequest().signal);
    }),
  );
