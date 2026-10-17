import { createDatabase } from './index';
import { todos } from './schema';

// Fixed ids make re-running the seed safe without deleting the user's data.
const initialTodos = [
  { id: '00000000-0000-4000-8000-000000000001', title: 'TODOを追加してみる', completed: true },
  {
    id: '00000000-0000-4000-8000-000000000002',
    title: 'AIに今日の作業を相談する',
    completed: false,
  },
  { id: '00000000-0000-4000-8000-000000000003', title: '提案からTODOを採用する', completed: false },
];

const database = createDatabase(
  process.env.DATABASE_URL ?? 'postgresql://demo:demo@localhost:5434/work_assistant',
);
try {
  await database.db
    .insert(todos)
    .values(
      initialTodos.map((todo, index) => ({
        ...todo,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      })),
    )
    .onConflictDoNothing();
  console.info('Seed data is ready.');
} finally {
  await database.close();
}
