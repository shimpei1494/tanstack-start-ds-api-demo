import { z } from 'zod';

const settingsSchema = z.object({
  DATABASE_URL: z.string().url().default('postgresql://demo:demo@localhost:5434/work_assistant'),
  DS_MODE: z.enum(['mock', 'http']).default('mock'),
  DS_API_URL: z.string().url().default('http://127.0.0.1:8001'),
  DS_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export function readSettings(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = settingsSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error('Server configuration is invalid. Check the environment variables.');
  return parsed.data;
}
