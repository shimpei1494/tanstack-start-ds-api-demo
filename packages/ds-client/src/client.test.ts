import { describe, expect, it } from 'vitest';
import { ChatSequence, chatInputSchema, suggestionResponseSchema } from '@demo/ds-contract';
import { createDsClient, DsError, parseSse } from './index';
import fixtures from '../../ds-contract/fixtures/scenarios.json';

function input(text = '作業を始めたい') {
  return chatInputSchema.parse({
    threadId: 'thread-test',
    runId: 'run-test',
    state: {},
    tools: [],
    context: [],
    forwardedProps: {},
    messages: [{ id: 'message-user', role: 'user', content: text }],
  });
}
async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const event of events) result.push(event);
  return result;
}

const modes = [
  { name: 'mock', client: () => createDsClient({ mode: 'mock' }) },
  ...(process.env.DS_TEST_HTTP_URL
    ? [
        {
          name: 'HTTP',
          client: () => createDsClient({ mode: 'http', baseUrl: process.env.DS_TEST_HTTP_URL }),
        },
      ]
    : []),
];

describe.each(modes)('$name common contract', ({ client }) => {
  it('returns bounded suggestions matching the shared fixtures', async () => {
    const result = await client().suggestTodos({ goal: ' 学習 ' });
    expect(suggestionResponseSchema.parse(result)).toEqual({
      suggestions: fixtures.suggestion_suffixes.map((suffix) => ({ title: `学習：${suffix}` })),
      model_version: fixtures.model_version,
    });
  });
  it('keeps Unicode code point limits consistent with Python', async () => {
    const result = await client().suggestTodos({ goal: '😀'.repeat(500) });
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions[0].title.startsWith('😀'.repeat(160))).toBe(true);
  });
  it('rejects invalid input before contacting the service', async () => {
    await expect(client().suggestTodos({ goal: ' ' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(client().suggestTodos({ goal: 'a'.repeat(501) })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
  it.each([
    ['[error]', 'UNAVAILABLE'],
    ['[invalid]', 'INVALID_RESPONSE'],
  ])('classifies suggestion %s', async (goal, code) => {
    await expect(client().suggestTodos({ goal })).rejects.toMatchObject({ code });
  });
  it('streams partial text before the terminal event, preserving IDs and steps', async () => {
    const events = [];
    const sequence = new ChatSequence();
    let partialAt = 0;
    const startedAt = Date.now();
    for await (const event of client().streamChat(input())) {
      sequence.accept(event);
      events.push(event);
      if (event.type === 'TEXT_MESSAGE_CONTENT' && !partialAt) partialAt = Date.now();
    }
    sequence.finish();
    expect(events[0]).toMatchObject({
      type: 'RUN_STARTED',
      threadId: 'thread-test',
      runId: 'run-test',
    });
    expect(events.at(-1)).toMatchObject({ type: 'RUN_FINISHED' });
    expect(
      events.filter((event) => event.type === 'TEXT_MESSAGE_CONTENT').map((event) => event.delta),
    ).toEqual(fixtures.chat_deltas);
    expect(partialAt - startedAt).toBeGreaterThanOrEqual(50);
    expect(Date.now() - partialAt).toBeGreaterThanOrEqual(100);
  });
  it('reports a stream error as the terminal failure event', async () => {
    const events = await collect(client().streamChat(input('[stream-error]')));
    expect(events.at(-1)).toMatchObject({ type: 'RUN_ERROR', code: 'STREAM_ERROR' });
    expect(events.some((event) => event.type === 'RUN_FINISHED')).toBe(false);
  });
  it.each(['[disconnect]', '[invalid]'])(
    'rejects malformed or truncated %s streams',
    async (text) => {
      await expect(collect(client().streamChat(input(text)))).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    },
  );
  it('classifies a failure before the first streamed event', async () => {
    await expect(collect(client().streamChat(input('[error]')))).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });
  it('cancels pending generation immediately using AbortSignal', async () => {
    const cancellation = new AbortController();
    const iterator = client()
      .streamChat(input('[slow]'), cancellation.signal)
      [Symbol.asyncIterator]();
    await iterator.next();
    await iterator.next();
    const pending = iterator.next();
    const startedAt = Date.now();
    cancellation.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
  it('cancels a pending next() when its iterator is returned', async () => {
    const iterator = client().streamChat(input('[slow]'))[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.next();
    const pending = iterator.next();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    const startedAt = Date.now();
    await iterator.return?.();
    await rejected;
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});

it('times out slow mock inference', async () => {
  const client = createDsClient({ mode: 'mock', timeoutMs: 20 });
  await expect(client.suggestTodos({ goal: '[slow]' })).rejects.toMatchObject({ code: 'TIMEOUT' });
  await expect(collect(client.streamChat(input('[slow]')))).rejects.toMatchObject({
    code: 'TIMEOUT',
  });
});

it('decodes fragmented UTF-8, CRLF, comments and multiline data', async () => {
  const wire = new TextEncoder().encode(
    ': heartbeat\r\nevent: message\r\ndata: {"text":\r\ndata: "日本語"}\r\n\r\n',
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of wire) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  expect(await collect(parseSse(body))).toEqual([{ text: '日本語' }]);
});

it.each(['data: {bad}\n\n', 'data: {}', 'data: {}\n'])(
  'rejects broken or incomplete SSE frames %s',
  async (wire) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire));
        controller.close();
      },
    });
    await expect(collect(parseSse(body))).rejects.toBeInstanceOf(DsError);
  },
);

it('rejects unknown/duplicate/out of order events and unfinished work', () => {
  expect(() =>
    new ChatSequence().accept({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'x' }),
  ).toThrow();
  const sequence = new ChatSequence();
  sequence.accept({ type: 'RUN_STARTED', threadId: 't', runId: 'r' });
  expect(() => sequence.accept({ type: 'RUN_STARTED', threadId: 't', runId: 'r' })).toThrow();
  sequence.accept({ type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' });
  expect(() =>
    sequence.accept({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'other', delta: 'x' }),
  ).toThrow();
  expect(() => sequence.accept({ type: 'RUN_FINISHED', threadId: 't', runId: 'r' })).toThrow();
  sequence.accept({ type: 'RUN_ERROR', code: 'STREAM_ERROR', message: 'failed' });
  sequence.finish();
  expect(() => sequence.accept({ type: 'RUN_ERROR', message: 'again' })).toThrow();
});
