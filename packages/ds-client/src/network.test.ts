import { createServer } from 'node:http';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { chatInputSchema } from '@demo/ds-contract';
import { createDsClient } from './index';

let baseUrl = '';
const disconnected = new Set<string>();
const server = createServer((request, response) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString()) as {
      goal?: string;
      runId?: string;
      threadId?: string;
    };
    if (request.url === '/v1/todo-suggestions') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{broken');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (event: unknown) => response.write(`data: ${JSON.stringify(event)}\r\n\r\n`);
    response.on('close', () => {
      if (!response.writableEnded) disconnected.add(input.runId!);
    });
    if (input.runId === 'utf8') {
      const events = [
        { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId },
        { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: '日本語の返答' },
        { type: 'TEXT_MESSAGE_END', messageId: 'm' },
        { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId },
      ];
      for (const event of events) {
        const bytes = Buffer.from(`data: ${JSON.stringify(event)}\r\n\r\n`);
        for (const byte of bytes) {
          if (response.destroyed) return;
          response.write(Uint8Array.of(byte));
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }
      response.end();
    } else if (input.runId === 'wrong-id') {
      send({ type: 'RUN_STARTED', threadId: 'wrong', runId: input.runId });
      response.end();
    } else if (input.runId === 'out-of-order') {
      send({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'bad' });
      response.end();
    } else if (input.runId === 'truncated') {
      send({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId });
      response.end();
    } else {
      send({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId });
      const keepAlive = setInterval(() => response.write(': waiting\n\n'), 30);
      response.once('close', () => clearInterval(keepAlive));
    }
  })().catch(() => response.destroy());
});

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('HTTP test server address unavailable');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
const input = (runId: string) =>
  chatInputSchema.parse({
    runId,
    threadId: 'thread',
    state: {},
    tools: [],
    context: [],
    forwardedProps: {},
    messages: [{ id: 'u', role: 'user', content: '始めたい' }],
  });
async function collect(runId: string) {
  const result = [];
  for await (const event of createDsClient({ mode: 'http', baseUrl }).streamChat(input(runId)))
    result.push(event);
  return result;
}
async function waitForDisconnect(runId: string) {
  for (let count = 0; count < 30 && !disconnected.has(runId); count++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  expect(disconnected.has(runId)).toBe(true);
}

it('decodes a real HTTP response with byte-fragmented Japanese text and CRLF frames', async () => {
  const events = await collect('utf8');
  expect(events.find((event) => event.type === 'TEXT_MESSAGE_CONTENT')).toMatchObject({
    delta: '日本語の返答',
  });
  expect(events.at(-1)?.type).toBe('RUN_FINISHED');
});
it.each(['wrong-id', 'out-of-order', 'truncated'])(
  'rejects real HTTP %s streams',
  async (runId) => {
    await expect(collect(runId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  },
);
it('classifies malformed HTTP JSON as an invalid response', async () => {
  await expect(
    createDsClient({ mode: 'http', baseUrl }).suggestTodos({ goal: 'x' }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
it('closes the upstream socket when a pending stream read is cancelled', async () => {
  const abort = new AbortController();
  const iterator = createDsClient({ mode: 'http', baseUrl })
    .streamChat(input('cancel'), abort.signal)
    [Symbol.asyncIterator]();
  await iterator.next();
  const pending = iterator.next();
  abort.abort();
  await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  await waitForDisconnect('cancel');
});
it('closes the upstream socket on timeout even while keepalive comments arrive', async () => {
  const iterator = createDsClient({ mode: 'http', baseUrl, timeoutMs: 100 })
    .streamChat(input('timeout'))
    [Symbol.asyncIterator]();
  await iterator.next();
  await expect(iterator.next()).rejects.toMatchObject({ code: 'TIMEOUT' });
  await waitForDisconnect('timeout');
});
