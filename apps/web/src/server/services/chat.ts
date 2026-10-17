import type { DsClient } from '@demo/ds-client';
import type { ChatInput } from '@demo/ds-contract';

export function createChatService(client: Pick<DsClient, 'streamChat'>) {
  return { stream: (input: ChatInput, signal?: AbortSignal) => client.streamChat(input, signal) };
}
