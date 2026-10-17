import { describe, expect, it } from 'vitest';
import openapi from '../openapi.json';
import { chatInputSchema, suggestionInputSchema, suggestionResponseSchema } from './index';

describe('runtime validators follow saved OpenAPI bounds', () => {
  it('accepts and rejects suggestion input at the generated contract limits', () => {
    const goal = openapi.components.schemas.SuggestionInput.properties.goal;
    expect(suggestionInputSchema.safeParse({ goal: 'x'.repeat(goal.maxLength) }).success).toBe(
      true,
    );
    expect(suggestionInputSchema.safeParse({ goal: 'x'.repeat(goal.maxLength + 1) }).success).toBe(
      false,
    );
    expect(suggestionInputSchema.safeParse({ goal: '😀'.repeat(goal.maxLength) }).success).toBe(
      true,
    );
    expect(suggestionInputSchema.safeParse({ goal: '' }).success).toBe(false);
    expect(suggestionInputSchema.safeParse({ goal: '   ' }).success).toBe(false);
  });
  it('enforces title, candidate count and model version bounds from OpenAPI', () => {
    const response = openapi.components.schemas.SuggestionResponse.properties;
    const title = openapi.components.schemas.Suggestion.properties.title;
    const valid = {
      suggestions: Array.from({ length: response.suggestions.maxItems }, () => ({
        title: 'x'.repeat(title.maxLength),
      })),
      model_version: 'v',
    };
    expect(suggestionResponseSchema.safeParse(valid).success).toBe(true);
    expect(suggestionResponseSchema.safeParse({ ...valid, suggestions: [] }).success).toBe(false);
    expect(
      suggestionResponseSchema.safeParse({
        ...valid,
        suggestions: [...valid.suggestions, { title: 'x' }],
      }).success,
    ).toBe(false);
    expect(
      suggestionResponseSchema.safeParse({
        ...valid,
        suggestions: [{ title: 'x'.repeat(title.maxLength + 1) }],
      }).success,
    ).toBe(false);
    expect(
      suggestionResponseSchema.safeParse({ ...valid, suggestions: [{ title: ' ' }] }).success,
    ).toBe(false);
    expect(
      suggestionResponseSchema.safeParse({
        ...valid,
        model_version: 'x'.repeat(response.model_version.maxLength + 1),
      }).success,
    ).toBe(false);
  });
  it('rejects unsupported agent inputs instead of forwarding opaque properties', () => {
    const input = {
      threadId: 't',
      runId: 'r',
      messages: [{ id: 'u', role: 'user', content: 'text' }],
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
    };
    expect(chatInputSchema.safeParse(input).success).toBe(true);
    for (const field of ['state', 'forwardedProps'])
      expect(chatInputSchema.safeParse({ ...input, [field]: { model: 'unknown' } }).success).toBe(
        false,
      );
    expect(
      chatInputSchema.safeParse({
        ...input,
        messages: [{ id: 'u', role: 'user', content: 'text', metadata: {} }],
      }).success,
    ).toBe(false);
    expect(
      chatInputSchema.safeParse({
        ...input,
        messages: [{ id: 'u', role: 'assistant', content: 'text' }],
      }).success,
    ).toBe(false);
  });
});
