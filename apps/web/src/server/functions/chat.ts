import { createServerFn } from '@tanstack/react-start';
import { toChatInput, toSseResponse } from '@demo/chat-adapter';
import type { AgUiChatEvent } from '@demo/ds-contract';
import { z } from 'zod';
import { toPublicError } from '../services/errors';

const inputSchema = z.object({
  messages: z.array(z.unknown()).max(100),
  threadId: z.string().min(1).max(200),
});

export const chatFn = createServerFn({ method: 'POST' })
  .validator((input: z.input<typeof inputSchema>) => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw new Error('入力内容を確認してください。');
    return parsed.data;
  })
  .handler(async ({ data }) => {
    const { getRequest } = await import('@tanstack/react-start/server');
    const signal = getRequest().signal;
    let input;
    try {
      input = toChatInput(data.messages, data.threadId);
    } catch {
      throw new Error('入力内容を確認してください。');
    }
    const { getDsServices } = await import('../dependencies/index.server');
    const iterator = getDsServices().chat.stream(input, signal)[Symbol.asyncIterator]();
    // Wait for the upstream connection and first validated event before sending SSE headers.
    // Later failures are encoded as RUN_ERROR by the adapter.
    let first: IteratorResult<AgUiChatEvent>;
    try {
      first = await iterator.next();
    } catch (error) {
      throw new Error(toPublicError(error).message);
    }
    // Proxy return() directly: an async-generator wrapper would queue cancellation
    // behind a pending next(), delaying cancellation of an in-flight HTTP request.
    const events: AsyncIterable<AgUiChatEvent> = {
      [Symbol.asyncIterator]() {
        let buffered: IteratorResult<AgUiChatEvent> | undefined = first;
        return {
          next() {
            if (!buffered) return iterator.next();
            const next = buffered;
            buffered = undefined;
            return Promise.resolve(next);
          },
          return: () =>
            iterator.return
              ? iterator.return()
              : Promise.resolve({ done: true as const, value: undefined }),
        };
      },
    };
    return toSseResponse(events, signal);
  });
