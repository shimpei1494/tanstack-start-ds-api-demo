import { expect, it } from 'vitest';
import { readSettings } from './settings.server';

it('defaults to the Python-free mock mode and validates numeric timeouts', () => {
  expect(readSettings({}).DS_MODE).toBe('mock');
  expect(readSettings({ DS_MODE: 'http', DS_TIMEOUT_MS: '1250' }).DS_TIMEOUT_MS).toBe(1250);
});

it('fails closed on invalid settings without echoing environment secrets', () => {
  expect(() => readSettings({ DS_MODE: 'typo', DATABASE_URL: 'private-password' })).toThrow(
    'Server configuration is invalid. Check the environment variables.',
  );
});
