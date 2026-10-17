import { createDatabase } from '@demo/db';
import { createDsClient } from '@demo/ds-client';
import { createChatService } from '../services/chat';
import { createSuggestionService } from '../services/suggestions';
import { createTodoService } from '../services/todos';
import { readSettings } from './settings.server';

// Lazy composition: importing a Server Function does not open a pool or read secrets.
let database: ReturnType<typeof createDatabase> | undefined;
let dsServices: ReturnType<typeof buildDsServices> | undefined;

function buildDsServices() {
  const settings = readSettings();
  const client = createDsClient({
    mode: settings.DS_MODE,
    baseUrl: settings.DS_API_URL,
    timeoutMs: settings.DS_TIMEOUT_MS,
  });
  return { suggestions: createSuggestionService(client), chat: createChatService(client) };
}

export function getTodoService() {
  database ??= createDatabase(readSettings().DATABASE_URL);
  return createTodoService(database.todos);
}

export function getDsServices() {
  dsServices ??= buildDsServices();
  return dsServices;
}
