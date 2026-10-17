/** Read port: the DB implementation returns one consistent bounded snapshot. */
export interface ReportRepository {
  snapshot(this: void): Promise<{
    total: number;
    completed: number;
    nextTodos: Array<{ id: string; title: string }>;
  }>;
}
