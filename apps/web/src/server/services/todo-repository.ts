import type { TodoFilter } from '../../contracts/todos';

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TodoRepository {
  list(this: void, filter: TodoFilter): Promise<Todo[]>;
  create(this: void, title: string): Promise<Todo>;
  update(
    this: void,
    id: string,
    changes: { title?: string; completed?: boolean },
  ): Promise<Todo | undefined>;
  delete(this: void, id: string): Promise<boolean>;
}
