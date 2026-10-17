import { createServerFn } from '@tanstack/react-start';
import type { z } from 'zod';
import { workReportRequestSchema } from '../../contracts/reports';
import { ApplicationError, publicResult } from '../services/errors';

export const getWorkReportFn = createServerFn({ method: 'GET' })
  .validator((input: z.input<typeof workReportRequestSchema>) => input)
  .handler(({ data }) =>
    publicResult(async () => {
      const parsed = workReportRequestSchema.safeParse(data);
      if (!parsed.success) throw new ApplicationError('INVALID_INPUT', 'Invalid report request');
      const { getReportService } = await import('../dependencies/index.server');
      const { getRequest } = await import('@tanstack/react-start/server');
      return getReportService().generate(parsed.data, getRequest().signal);
    }),
  );
