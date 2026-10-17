import type { CreateTodoInput, TodoDto, TodoFilter, UpdateTodoInput } from '../../contracts/todos';
import { createTodoInputSchema, updateTodoInputSchema } from '../../contracts/todos';
import { ApplicationError } from './errors';
import type { Todo, TodoRepository } from './todo-repository';

function toDto(todo: Todo): TodoDto {
  return {
    ...todo,
    createdAt: todo.createdAt.toISOString(),
    updatedAt: todo.updatedAt.toISOString(),
  };
}

export function createTodoService(repository: TodoRepository) {
  return {
    async list(filter: TodoFilter): Promise<TodoDto[]> {
      return (await repository.list(filter)).map(toDto);
    },
    async create(input: CreateTodoInput): Promise<TodoDto> {
      const parsed = createTodoInputSchema.safeParse(input);
      if (!parsed.success) throw new ApplicationError('INVALID_INPUT', 'Invalid todo');
      return toDto(await repository.create(parsed.data.title));
    },
    async update(input: UpdateTodoInput): Promise<TodoDto> {
      const parsed = updateTodoInputSchema.safeParse(input);
      if (!parsed.success) throw new ApplicationError('INVALID_INPUT', 'Invalid todo changes');
      const { id, ...changes } = parsed.data;
      const todo = await repository.update(id, changes);
      if (!todo) throw new ApplicationError('NOT_FOUND', 'Todo not found');
      return toDto(todo);
    },
    async delete(id: string): Promise<{ id: string }> {
      if (!(await repository.delete(id))) throw new ApplicationError('NOT_FOUND', 'Todo not found');
      return { id };
    },
  };
}
