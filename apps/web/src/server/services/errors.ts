import type { PublicError, PublicErrorCode, Result } from '../../contracts/result';

export class ApplicationError extends Error {
  constructor(
    public readonly code: PublicErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

const messages: Record<PublicErrorCode, string> = {
  INVALID_INPUT: '入力内容を確認してください。',
  NOT_FOUND: '対象のTODOが見つかりません。',
  UNAVAILABLE: 'AIサービスに接続できません。しばらくしてから再試行してください。',
  TIMEOUT: 'AIサービスの応答がタイムアウトしました。再試行してください。',
  INVALID_RESPONSE: 'AIサービスの応答を読み取れませんでした。再試行してください。',
  INTERNAL: '処理に失敗しました。しばらくしてから再試行してください。',
};

/** Only allow-listed codes cross the server boundary; never expose exception text. */
export function toPublicError(error: unknown): PublicError {
  let code: PublicErrorCode = 'INTERNAL';
  if (error instanceof ApplicationError) code = error.code;
  else if (error instanceof Error && error.name === 'DsError' && 'code' in error) {
    const candidate = String(error.code);
    if (
      candidate === 'INVALID_INPUT' ||
      candidate === 'UNAVAILABLE' ||
      candidate === 'TIMEOUT' ||
      candidate === 'INVALID_RESPONSE'
    )
      code = candidate;
  }
  return { code, message: messages[code] };
}

export async function publicResult<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, error: toPublicError(error) };
  }
}
