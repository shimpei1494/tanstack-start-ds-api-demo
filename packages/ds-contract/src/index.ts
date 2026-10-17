import { z } from 'zod';
import {
  RunAgentInputSchema,
  RunStartedEventSchema,
  RunFinishedEventSchema,
  RunErrorEventSchema,
  StepStartedEventSchema,
  StepFinishedEventSchema,
  TextMessageStartEventSchema,
  TextMessageContentEventSchema,
  TextMessageEndEventSchema,
} from '@ag-ui/core/schemas';
import type { components } from './openapi';

export type SuggestionInput = components['schemas']['SuggestionInput'];
export type SuggestionResponse = components['schemas']['SuggestionResponse'];
export const suggestionInputSchema: z.ZodType<SuggestionInput> = z.strictObject({
  goal: z
    .string()
    .refine((value) => Array.from(value).length <= 500)
    .transform((value) => value.trim())
    .pipe(z.string().min(1)),
});
export const suggestionResponseSchema: z.ZodType<SuggestionResponse> = z.strictObject({
  suggestions: z
    .array(
      z.strictObject({
        title: z
          .string()
          .trim()
          .min(1)
          .refine((value) => Array.from(value).length <= 200),
      }),
    )
    .min(1)
    .max(5),
  model_version: z
    .string()
    .min(1)
    .refine((value) => Array.from(value).length <= 100),
});
export type WorkReportInput = components['schemas']['WorkReportInput'];
export type WorkReportResponse = components['schemas']['WorkReportResponse'];
export const reportScenarioSchema = z.enum(['normal', 'slow', 'error']);
export type ReportScenario = z.infer<typeof reportScenarioSchema>;
export const workReportInputSchema: z.ZodType<WorkReportInput> = z
  .strictObject({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    next_todos: z
      .array(
        z.strictObject({
          id: z.uuid(),
          title: z
            .string()
            .trim()
            .min(1)
            .refine((value) => Array.from(value).length <= 200),
        }),
      )
      .max(3),
    scenario: reportScenarioSchema,
  })
  .superRefine((input, context) => {
    if (input.completed > input.total || input.next_todos.length > input.total - input.completed) {
      context.addIssue({ code: 'custom', message: 'Inconsistent report counts' });
    }
    if (
      new Set(input.next_todos.map((todo) => todo.id.toLowerCase())).size !==
      input.next_todos.length
    ) {
      context.addIssue({ code: 'custom', message: 'Duplicate report todo IDs' });
    }
  });
export const workReportResponseSchema: z.ZodType<WorkReportResponse> = z.strictObject({
  summary: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= 2000),
  next_steps: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .refine((value) => Array.from(value).length <= 200),
    )
    .max(3),
  model_version: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= 100),
});

const textMessageSchema = z.strictObject({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  content: z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= 4000),
});
// Extend the official schema to limit the features accepted by this demo.
export const chatInputSchema = RunAgentInputSchema.extend({
  threadId: z.string().min(1),
  runId: z.string().min(1),
  messages: z.array(textMessageSchema).min(1).max(100),
  state: z.strictObject({}),
  tools: z.tuple([]),
  context: z.tuple([]),
  forwardedProps: z.strictObject({}),
  protocolVersion: z.never().optional(),
  parentRunId: z.never().optional(),
  resume: z.never().optional(),
})
  .strict()
  .refine((input) => input.messages.at(-1)?.role === 'user', {
    message: 'The last message must be from the user',
  });
export type ChatInput = z.infer<typeof chatInputSchema>;

export const agUiChatEventSchema = z.union([
  RunStartedEventSchema,
  RunFinishedEventSchema,
  RunErrorEventSchema,
  StepStartedEventSchema,
  StepFinishedEventSchema,
  TextMessageStartEventSchema.extend({ role: z.literal('assistant') }),
  TextMessageContentEventSchema,
  TextMessageEndEventSchema,
]);
export type AgUiChatEvent = z.infer<typeof agUiChatEventSchema>;

/** Validate ordering and IDs as well as the official event payloads. */
export class ChatSequence {
  private started = false;
  private terminal = false;
  private threadId?: string;
  private runId?: string;
  private messageId?: string;
  private closedMessages = new Set<string>();
  private steps = new Set<string>();

  accept(raw: unknown): AgUiChatEvent {
    const event = agUiChatEventSchema.parse(raw);
    if (this.terminal) throw new Error('Event received after terminal event');
    if (!this.started && event.type !== 'RUN_STARTED') throw new Error('RUN_STARTED required');
    switch (event.type) {
      case 'RUN_STARTED':
        if (this.started) throw new Error('Duplicate RUN_STARTED');
        this.started = true;
        this.threadId = event.threadId;
        this.runId = event.runId;
        break;
      case 'STEP_STARTED':
        if (this.steps.has(event.stepName)) throw new Error('Step already started');
        this.steps.add(event.stepName);
        break;
      case 'STEP_FINISHED':
        if (!this.steps.delete(event.stepName)) throw new Error('Step was not started');
        break;
      case 'TEXT_MESSAGE_START':
        if (this.messageId || this.closedMessages.has(event.messageId))
          throw new Error('Duplicate message');
        this.messageId = event.messageId;
        break;
      case 'TEXT_MESSAGE_CONTENT':
      case 'TEXT_MESSAGE_END':
        if (this.messageId !== event.messageId) throw new Error('Mismatched message ID');
        if (event.type === 'TEXT_MESSAGE_END') {
          this.closedMessages.add(event.messageId);
          this.messageId = undefined;
        }
        break;
      case 'RUN_FINISHED':
        if (event.threadId !== this.threadId || event.runId !== this.runId)
          throw new Error('Mismatched run ID');
        if (this.messageId || this.steps.size) throw new Error('Run finished with open work');
        this.terminal = true;
        break;
      case 'RUN_ERROR':
        this.terminal = true;
        break;
    }
    return event;
  }

  finish(): void {
    if (!this.terminal) throw new Error('Stream ended without a terminal event');
  }
}
export type { paths, components } from './openapi';
