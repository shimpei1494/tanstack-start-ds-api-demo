export type PublicErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'INTERNAL';
export interface PublicError {
  code: PublicErrorCode;
  message: string;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: PublicError };
