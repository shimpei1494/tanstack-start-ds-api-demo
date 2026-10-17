import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { todos } from './schema';

export type ReportSnapshot = {
  total: number;
  completed: number;
  nextTodos: Array<{ id: string; title: string }>;
};

export interface ReportRepository {
  snapshot(this: void): Promise<ReportSnapshot>;
}

export function createReportRepository(db: NodePgDatabase): ReportRepository {
  return {
    async snapshot() {
      // Both aggregates and the bounded subquery share one PostgreSQL statement
      // snapshot. Only three titles leave the DB, regardless of TODO count.
      const result = await db.execute<ReportSnapshot>(sql`
        SELECT count(*)::integer AS total,
          (count(*) FILTER (WHERE ${todos.completed}))::integer AS completed,
          COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object('id', pending.id, 'title', pending.title)
              ORDER BY pending.created_at, pending.id
            )
            FROM (
              SELECT ${todos.id}, ${todos.title}, ${todos.createdAt}
              FROM ${todos}
              WHERE NOT ${todos.completed}
              ORDER BY ${todos.createdAt}, ${todos.id}
              LIMIT 3
            ) AS pending
          ), '[]'::jsonb) AS "nextTodos"
        FROM ${todos}
      `);
      const snapshot = result.rows[0];
      if (!snapshot) throw new Error('Report snapshot was not returned');
      return snapshot;
    },
  };
}
