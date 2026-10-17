import createClient from 'openapi-fetch';
import {
  ChatSequence,
  chatInputSchema,
  suggestionInputSchema,
  suggestionResponseSchema,
  workReportInputSchema,
  workReportResponseSchema,
  type AgUiChatEvent,
  type ChatInput,
  type SuggestionInput,
  type SuggestionResponse,
  type WorkReportInput,
  type WorkReportResponse,
} from '@demo/ds-contract';
import type { paths } from '@demo/ds-contract';
import fixtures from '../../ds-contract/fixtures/scenarios.json';

export type DsErrorCode =
  | 'INVALID_INPUT'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'ABORTED'
  | 'STREAM_ERROR';
const messages: Record<DsErrorCode, string> = {
  INVALID_INPUT: '入力内容を確認してください。',
  UNAVAILABLE: 'AIサービスに接続できません。時間をおいて再試行してください。',
  TIMEOUT: 'AIサービスの応答が時間内に完了しませんでした。',
  INVALID_RESPONSE: 'AIサービスから正しい応答を受信できませんでした。',
  ABORTED: '生成を停止しました。',
  STREAM_ERROR: '回答の生成に失敗しました。',
};
export class DsError extends Error {
  constructor(public readonly code: DsErrorCode) {
    super(messages[code]);
    this.name = 'DsError';
  }
}
export { DsError as DsClientError };
export interface DsClient {
  createWorkReport(input: WorkReportInput, signal?: AbortSignal): Promise<WorkReportResponse>;
  suggestTodos(input: SuggestionInput, signal?: AbortSignal): Promise<SuggestionResponse>;
  streamChat(input: ChatInput, signal?: AbortSignal): AsyncIterable<AgUiChatEvent>;
}

function scope(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, timeoutMs);
  const failure = (error: unknown): DsError => {
    if (controller.signal.aborted) return new DsError(timedOut ? 'TIMEOUT' : 'ABORTED');
    return error instanceof DsError
      ? error
      : new DsError(error instanceof SyntaxError ? 'INVALID_RESPONSE' : 'UNAVAILABLE');
  };
  return {
    signal: controller.signal,
    failure,
    close: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      controller.abort();
    },
  };
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function parseInput<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch {
    throw new DsError('INVALID_INPUT');
  }
}

/** SSE framing operates on decoded lines, never on transport chunk boundaries. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let data: string[] = [];
  let eventBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length + eventBytes > 1_048_576) throw new DsError('INVALID_RESPONSE');
      while (true) {
        const index = buffer.search(/[\r\n]/);
        if (index < 0 || (!done && buffer[index] === '\r' && index === buffer.length - 1)) break;
        const line = buffer.slice(0, index);
        const width = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(index + width);
        if (line === '') {
          if (data.length) {
            const payload = data.join('\n');
            data = [];
            eventBytes = 0;
            try {
              yield JSON.parse(payload);
            } catch (error) {
              if (error instanceof DsError) throw error;
              throw new DsError('INVALID_RESPONSE');
            }
          }
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
          eventBytes += line.length;
        }
      }
      if (done) {
        if (buffer.trim() || data.length) throw new DsError('INVALID_RESPONSE');
        return;
      }
    }
  } catch (error) {
    if (error instanceof TypeError) throw new DsError('INVALID_RESPONSE');
    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function* mockEvents(input: ChatInput, signal: AbortSignal): AsyncGenerator<unknown> {
  const text = input.messages.at(-1)!.content;
  if (text.includes('[error]')) throw new DsError('UNAVAILABLE');
  const messageId = crypto.randomUUID();
  yield { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId };
  yield { type: 'STEP_STARTED', stepName: 'retrieve' };
  await delay(text.includes('[slow]') ? 5000 : 80, signal);
  yield { type: 'STEP_FINISHED', stepName: 'retrieve' };
  yield { type: 'STEP_STARTED', stepName: 'generate' };
  yield { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' };
  for (const [index, delta] of fixtures.chat_deltas.entries()) {
    await delay(80, signal);
    if (text.includes('[invalid]')) {
      yield { type: 'TEXT_MESSAGE_CONTENT', delta: 4 };
      return;
    }
    yield { type: 'TEXT_MESSAGE_CONTENT', messageId, delta };
    if (index === 0 && text.includes('[stream-error]')) {
      yield { type: 'RUN_ERROR', code: 'STREAM_ERROR', message: messages.STREAM_ERROR };
      return;
    }
    if (index === 0 && text.includes('[disconnect]')) return;
  }
  yield { type: 'TEXT_MESSAGE_END', messageId };
  yield { type: 'STEP_FINISHED', stepName: 'generate' };
  yield { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId };
}

export function createDsClient(options: {
  mode: 'mock' | 'http';
  baseUrl?: string;
  timeoutMs?: number;
}): DsClient {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('DS timeout must be positive');
  if (options.mode !== 'mock' && options.mode !== 'http') throw new Error('Unsupported DS mode');
  const baseUrl = options.baseUrl?.replace(/\/$/, '');
  if (options.mode === 'http' && (!baseUrl || !/^https?:\/\//.test(baseUrl)))
    throw new Error('DS HTTP URL required');
  const http = createClient<paths>({ baseUrl: baseUrl ?? 'http://unused.invalid' });
  const client: DsClient = {
    async createWorkReport(raw, signal) {
      const input = parseInput(workReportInputSchema, raw);
      const request = scope(signal, timeoutMs);
      try {
        request.signal.throwIfAborted();
        let response: unknown;
        if (options.mode === 'mock') {
          const rules = fixtures.work_report;
          await delay(
            input.scenario === 'normal' ? rules.normal_delay_ms : rules.pending_delay_ms,
            request.signal,
          );
          if (input.scenario === 'error') throw new DsError('UNAVAILABLE');
          response = {
            summary:
              input.total === 0
                ? rules.zero_summary
                : rules.summary_template
                    .replace('{total}', String(input.total))
                    .replace('{completed}', String(input.completed))
                    .replace('{remaining}', String(input.total - input.completed)),
            next_steps: input.next_todos.map(
              (todo) =>
                rules.next_step_prefix +
                Array.from(todo.title).slice(0, rules.title_limit).join('') +
                rules.next_step_suffix,
            ),
            model_version: fixtures.model_version,
          };
        } else {
          const result = await http.POST('/v1/work-report', {
            body: input,
            signal: request.signal,
          });
          if (!result.response.ok)
            throw new DsError(result.response.status === 422 ? 'INVALID_INPUT' : 'UNAVAILABLE');
          response = result.data;
        }
        const parsed = workReportResponseSchema.safeParse(response);
        if (!parsed.success) throw new DsError('INVALID_RESPONSE');
        return parsed.data;
      } catch (error) {
        throw request.failure(error);
      } finally {
        request.close();
      }
    },
    async suggestTodos(raw, signal) {
      const input = parseInput(suggestionInputSchema, raw);
      const request = scope(signal, timeoutMs);
      try {
        request.signal.throwIfAborted();
        let response: unknown;
        if (options.mode === 'mock') {
          await delay(input.goal.includes('[slow]') ? 5000 : 80, request.signal);
          if (input.goal.includes('[error]')) throw new DsError('UNAVAILABLE');
          response = input.goal.includes('[invalid]')
            ? {}
            : {
                suggestions: fixtures.suggestion_suffixes.map((suffix) => ({
                  title: `${Array.from(input.goal).slice(0, 160).join('')}：${suffix}`,
                })),
                model_version: fixtures.model_version,
              };
        } else {
          const result = await http.POST('/v1/todo-suggestions', {
            body: input,
            signal: request.signal,
          });
          if (!result.response.ok)
            throw new DsError(result.response.status === 422 ? 'INVALID_INPUT' : 'UNAVAILABLE');
          response = result.data;
        }
        const parsed = suggestionResponseSchema.safeParse(response);
        if (!parsed.success) throw new DsError('INVALID_RESPONSE');
        return parsed.data;
      } catch (error) {
        throw request.failure(error);
      } finally {
        request.close();
      }
    },
    async *streamChat(raw, signal) {
      const input = parseInput(chatInputSchema, raw);
      const request = scope(signal, timeoutMs);
      let source: AsyncIterable<unknown>;
      try {
        request.signal.throwIfAborted();
        if (options.mode === 'mock') source = mockEvents(input, request.signal);
        else {
          const response = await fetch(`${baseUrl}/v1/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify(input),
            signal: request.signal,
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new DsError(response.status === 422 ? 'INVALID_INPUT' : 'UNAVAILABLE');
          }
          if (
            !response.body ||
            !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')
          ) {
            await response.body?.cancel();
            throw new DsError('INVALID_RESPONSE');
          }
          source = parseSse(response.body);
        }
        const sequence = new ChatSequence();
        for await (const rawEvent of source) {
          request.signal.throwIfAborted();
          let event: AgUiChatEvent;
          try {
            event = sequence.accept(rawEvent);
          } catch {
            throw new DsError('INVALID_RESPONSE');
          }
          if (
            event.type === 'RUN_STARTED' &&
            (event.threadId !== input.threadId || event.runId !== input.runId)
          )
            throw new DsError('INVALID_RESPONSE');
          yield event.type === 'RUN_ERROR'
            ? { type: event.type, code: 'STREAM_ERROR', message: messages.STREAM_ERROR }
            : event;
        }
        try {
          sequence.finish();
        } catch {
          throw new DsError('INVALID_RESPONSE');
        }
      } catch (error) {
        throw request.failure(error);
      } finally {
        request.close();
      }
    },
  };
  return {
    createWorkReport: (input, signal) => client.createWorkReport(input, signal),
    suggestTodos: (input, signal) => client.suggestTodos(input, signal),
    streamChat(input, signal) {
      // Iterator.return() cancels an in-flight next(), not just the next await boundary.
      const cancellation = new AbortController();
      const combined = signal
        ? AbortSignal.any([signal, cancellation.signal])
        : cancellation.signal;
      const iterator = client.streamChat(input, combined)[Symbol.asyncIterator]();
      return {
        [Symbol.asyncIterator]() {
          return {
            next: () => iterator.next(),
            return: async () => {
              cancellation.abort();
              return iterator.return
                ? iterator.return()
                : { done: true as const, value: undefined };
            },
          };
        },
      };
    },
  };
}
