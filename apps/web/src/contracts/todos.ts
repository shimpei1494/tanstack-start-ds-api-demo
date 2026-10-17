import { z } from 'zod';

export const todoFilterSchema = z.enum(['all', 'active', 'completed']);
export type TodoFilter = z.infer<typeof todoFilterSchema>;
export const todoTitleSchema = z
  .string()
  .trim()
  .min(1, 'タイトルを入力してください。')
  .max(200, 'タイトルは200文字以内で入力してください。');
export const listTodosInputSchema = z.object({ filter: todoFilterSchema.default('all') });
export const createTodoInputSchema = z.object({ title: todoTitleSchema });
export const todoIdSchema = z.uuid();
export const deleteTodoInputSchema = z.object({ id: todoIdSchema });
export const updateTodoInputSchema = z
  .object({
    id: todoIdSchema,
    title: todoTitleSchema.optional(),
    completed: z.boolean().optional(),
  })
  .refine(
    (input) => input.title !== undefined || input.completed !== undefined,
    '変更内容を指定してください。',
  );

export interface TodoDto {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateTodoInput = z.infer<typeof createTodoInputSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoInputSchema>;
