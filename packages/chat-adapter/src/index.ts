import { EventEncoder } from '@ag-ui/encoder';
import { z } from 'zod';
import {
  ChatSequence,
  agUiChatEventSchema,
  chatInputSchema,
  type AgUiChatEvent,
  type ChatInput,
} from '@demo/ds-contract';

const uiMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  parts: z.array(z.object({ type: z.literal('text'), content: z.string() })),
});

export function toChatInput(messages: unknown[], threadId: string): ChatInput {
  const normalized = messages.map((raw) => {
    const message = uiMessageSchema.parse(raw);
    return {
      id: message.id,
      role: message.role,
      content: message.parts.map((part) => part.content).join(''),
    };
  });
  return chatInputSchema.parse({
    threadId,
    runId: crypto.randomUUID(),
    messages: normalized,
    state: {},
    tools: [],
    context: [],
    forwardedProps: {},
  });
}

/** Preserve AG-UI basic events for TanStack AI's fetcher SSE transport. */
export function toSseResponse(
  events: AsyncIterable<AgUiChatEvent>,
  signal?: AbortSignal,
): Response {
  const encoder = new EventEncoder({ accept: 'text/event-stream' });
  const textEncoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  const sequence = new ChatSequence();
  let closed = false;
  let terminal = false;
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  const cleanup = () => {
    signal?.removeEventListener('abort', abort);
  };
  const abort = () => {
    if (closed) return;
    closed = true;
    cleanup();
    streamController.close();
    void iterator.return?.();
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    },
    async pull(controller) {
      if (closed) return;
      try {
        const next = await iterator.next();
        if (closed) return;
        if (next.done) {
          sequence.finish();
          closed = true;
          cleanup();
          controller.close();
          return;
        }
        const event = sequence.accept(next.value);
        terminal = event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR';
        controller.enqueue(textEncoder.encode(encoder.encode(event)));
      } catch {
        if (closed) return;
        // Transport and validation errors become a stable, safe SDK-visible failure.
        if (!terminal) {
          const event = agUiChatEventSchema.parse({
            type: 'RUN_ERROR',
            code: 'STREAM_ERROR',
            message: '回答の生成に失敗しました。',
          });
          controller.enqueue(textEncoder.encode(encoder.encode(event)));
        }
        closed = true;
        cleanup();
        controller.close();
        await iterator.return?.();
      }
    },
    async cancel() {
      closed = true;
      cleanup();
      await iterator.return?.();
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': encoder.getContentType(),
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
