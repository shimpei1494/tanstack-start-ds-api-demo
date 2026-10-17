import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createTodoRepository } from './repository';

export { createTodoRepository } from './repository';
export type { TodoFilter, TodoRecord, TodoRepository } from './repository';
export { todos } from './schema';

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, max: 10 });
  const db = drizzle(pool);
  return { db, pool, todos: createTodoRepository(db), close: () => pool.end() };
}
