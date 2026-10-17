import { z } from 'zod';

export const workReportRequestSchema = z.object({
  scenario: z.enum(['normal', 'slow', 'error']).default('normal'),
});

export type WorkReportRequest = z.infer<typeof workReportRequestSchema>;

export interface WorkReportDto {
  total: number;
  completed: number;
  remaining: number;
  nextTodos: Array<{ id: string; title: string }>;
  summary: string;
  nextSteps: string[];
  modelVersion: string;
  generatedAt: string;
}
