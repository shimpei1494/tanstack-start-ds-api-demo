import { createServerFn } from '@tanstack/react-start';

export const appInfoFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { readSettings } = await import('../dependencies/settings.server');
  return { dsMode: readSettings().DS_MODE, dummy: true as const };
});
