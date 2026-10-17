import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/index';

const testUrl = process.env.TEST_DATABASE_URL;

// Explicit opt-in prevents the test from ever selecting the normal application DB.
describe.skipIf(!testUrl)('PostgreSQL todo repository', () => {
  let database: ReturnType<typeof createDatabase>;
  const createdIds: string[] = [];
  const prefix = `integration-${randomUUID()}`;

  beforeAll(async () => {
    database = createDatabase(testUrl!);
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
  });

  afterAll(async () => {
    if (!database) return;
    try {
      for (const id of createdIds) await database.todos.delete(id);
    } finally {
      await database.close();
    }
  });

  it('persists, filters, edits and deletes TODOs through real SQL', async () => {
    const active = await database.todos.create(`${prefix} active`);
    const completed = await database.todos.create(`${prefix} completed`);
    createdIds.push(active.id, completed.id);
    expect(active.completed).toBe(false);
    expect(active.createdAt).toBeInstanceOf(Date);

    const updated = await database.todos.update(completed.id, {
      completed: true,
      title: `${prefix} edited`,
    });
    expect(updated).toMatchObject({ id: completed.id, completed: true, title: `${prefix} edited` });
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(completed.updatedAt.getTime());
    const matchingIds = async (filter: 'all' | 'active' | 'completed') =>
      (await database.todos.list(filter))
        .filter((todo) => todo.title.startsWith(prefix))
        .map((todo) => todo.id);
    expect(await matchingIds('all')).toEqual([active.id, completed.id]);
    expect(await matchingIds('active')).toEqual([active.id]);
    expect(await matchingIds('completed')).toEqual([completed.id]);

    expect(await database.todos.delete(active.id)).toBe(true);
    expect(await database.todos.delete(active.id)).toBe(false);
    expect(await database.todos.update(active.id, { title: 'Missing' })).toBeUndefined();
    expect(await matchingIds('all')).toEqual([completed.id]);
  });
});
