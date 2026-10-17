import { asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { todos } from './schema';

export type TodoRecord = typeof todos.$inferSelect;
export type TodoFilter = 'all' | 'active' | 'completed';

/** The service port contains only operations needed by this application. */
export interface TodoRepository {
  list(filter: TodoFilter): Promise<TodoRecord[]>;
  create(title: string): Promise<TodoRecord>;
  update(
    id: string,
    changes: { title?: string; completed?: boolean },
  ): Promise<TodoRecord | undefined>;
  delete(id: string): Promise<boolean>;
}

export function createTodoRepository(db: NodePgDatabase): TodoRepository {
  return {
    async list(filter) {
      return db
        .select()
        .from(todos)
        .where(filter === 'all' ? undefined : eq(todos.completed, filter === 'completed'))
        .orderBy(asc(todos.createdAt), asc(todos.id));
    },
    async create(title) {
      const [todo] = await db.insert(todos).values({ title }).returning();
      if (!todo) throw new Error('Insert did not return a todo');
      return todo;
    },
    async update(id, changes) {
      const [todo] = await db
        .update(todos)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(todos.id, id))
        .returning();
      return todo;
    },
    async delete(id) {
      const rows = await db.delete(todos).where(eq(todos.id, id)).returning({ id: todos.id });
      return rows.length > 0;
    },
  };
}
