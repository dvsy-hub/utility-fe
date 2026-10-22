/** Error returned by the backend in its `{ result: false, error }` envelope. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  /** HTTP status code. */
  readonly status: number;
  /** `error.code` from the envelope (mirrors the HTTP status in the current backend). */
  readonly code: number;
  /** Validation details, e.g. `["initData should not be empty"]`. */
  readonly details: readonly string[] | string | null;

  constructor(params: { status: number; code: number; message: string; details: readonly string[] | string | null }) {
    super(params.message === '' ? `HTTP ${String(params.status)}` : params.message);
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
  }
}

/** The request never produced an HTTP response (offline, DNS, CORS, TLS…). */
export class NetworkError extends Error {
  override readonly name = 'NetworkError';
}

/** The request exceeded the client-side timeout. */
export class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
}

/** The server responded with something that is not the documented envelope. */
export class InvalidResponseError extends Error {
  override readonly name = 'InvalidResponseError';
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}
