import type { StreamChunk } from '@tanstack/ai';
import { useCallback, useState } from 'react';

const labels: Record<string, string> = {
  retrieve: '関連情報を検索中',
  generate: '回答を生成中',
  validate: '回答を確認中',
};
/** Only progress is local state. Message text and generation state belong to the SDK. */
export function useChatProgress() {
  const [step, setStep] = useState<string | null>(null);
  const onChunk = useCallback((chunk: StreamChunk) => {
    if (chunk.type === 'STEP_STARTED') setStep(labels[chunk.stepName] ?? '処理を進めています');
    if (
      chunk.type === 'STEP_FINISHED' ||
      chunk.type === 'RUN_FINISHED' ||
      chunk.type === 'RUN_ERROR'
    )
      setStep(null);
  }, []);
  const reset = useCallback(() => setStep(null), []);
  return { step, onChunk, reset };
}
