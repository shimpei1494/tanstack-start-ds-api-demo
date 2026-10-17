import { expect, it } from 'vitest';
import { agUiChatEventSchema, type AgUiChatEvent } from '@demo/ds-contract';
import { toChatInput, toSseResponse } from './index';

it('converts SDK text messages to the supported AG-UI input and uses a fresh run ID', () => {
  const messages = [{ id: 'u', role: 'user', parts: [{ type: 'text', content: '始めたい' }] }];
  const first = toChatInput(messages, 'thread');
  expect(first.messages).toEqual([{ id: 'u', role: 'user', content: '始めたい' }]);
  expect(toChatInput(messages, 'thread').runId).not.toEqual(first.runId);
  expect(() => toChatInput([{ id: 'u', role: 'system', parts: [] }], 't')).toThrow();
  expect(() =>
    toChatInput([{ id: 'u', role: 'user', parts: [{ type: 'image', url: 'x' }] }], 't'),
  ).toThrow();
});

it('encodes events with the official encoder and makes truncated streams SDK-visible errors', async () => {
  async function* truncated() {
    yield agUiChatEventSchema.parse({ type: 'RUN_STARTED', threadId: 't', runId: 'r' });
  }
  const response = toSseResponse(truncated());
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const wire = await response.text();
  expect(wire).toContain('RUN_STARTED');
  expect(wire).toContain('RUN_ERROR');
  expect(wire).not.toContain('RUN_FINISHED');
});

it('closes the upstream iterator when the browser cancels the response', async () => {
  let returned = false;
  const events: AsyncIterable<AgUiChatEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({
          done: false,
          value: agUiChatEventSchema.parse({ type: 'RUN_STARTED', threadId: 't', runId: 'r' }),
        }),
        return: async () => {
          returned = true;
          return { done: true, value: undefined };
        },
      };
    },
  };
  const reader = toSseResponse(events).body!.getReader();
  await reader.read();
  await reader.cancel();
  expect(returned).toBe(true);
});
