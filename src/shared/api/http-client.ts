import { isEnvelope } from './envelope';
import { ApiError, InvalidResponseError, NetworkError, TimeoutError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions<T> {
  readonly query?: Readonly<Record<string, QueryValue>>;
  /** Serialized as JSON. */
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /**
   * Runtime validator for `data`. Without it the payload is returned as `T` unchecked,
   * so use one wherever the app depends on the shape (e.g. auth tokens).
   */
  readonly parse?: (data: unknown) => T;
}

/**
 * Supplies and renews Bearer tokens. Implemented by the auth module; the HTTP layer
 * knows nothing about how tokens are obtained or stored.
 */
export interface AccessTokenProvider {
  getAccessToken(): string | null;
  /**
   * Called after a 401. `rejectedToken` lets the provider skip a refresh when another
   * request has already rotated the token. Resolves to the new token, or `null` when
   * the session cannot be renewed.
   */
  refreshAccessToken(rejectedToken: string | null): Promise<string | null>;
}

export interface HttpClientConfig {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** When set, requests carry `Authorization: Bearer …` and retry once after a refresh on 401. */
  readonly auth?: AccessTokenProvider;
  readonly fetch?: typeof fetch;
}

export interface HttpClient {
  request<T>(method: HttpMethod, path: string, options?: RequestOptions<T>): Promise<T>;
  get<T>(path: string, options?: Omit<RequestOptions<T>, 'body'>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions<T>, 'body'>): Promise<T>;
}

function buildUrl(baseUrl: string, path: string, query: RequestOptions<unknown>['query']): string {
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.href;
}

/**
 * Combines the caller's signal with a timeout without relying on `AbortSignal.any`
 * / `AbortSignal.timeout`, which older iOS WebViews lack.
 */
function withTimeout(
  outer: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; didTimeOut: () => boolean; dispose: () => void } {
  const controller = new AbortController();
  let timedOut = false;
  const onOuterAbort = (): void => {
    controller.abort(outer?.reason);
  };
  if (outer?.aborted === true) controller.abort(outer.reason);
  else outer?.addEventListener('abort', onOuterAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    },
  };
}

/** Status + fully read body (read inside the timeout window, so a stalled body also times out). */
interface RawResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly text: string;
}

function readEnvelope<T>(response: RawResponse, parse: ((data: unknown) => T) | undefined): T {
  const { text } = response;
  let json: unknown;
  try {
    json = text === '' ? undefined : JSON.parse(text);
  } catch {
    throw new InvalidResponseError(response.status, 'Response body is not valid JSON');
  }

  if (!isEnvelope(json)) {
    throw new InvalidResponseError(response.status, 'Response does not match the API envelope');
  }

  if (!response.ok || !json.result) {
    throw new ApiError({
      status: response.status,
      code: json.error.code,
      message: json.error.message,
      details: json.error.details ?? null,
    });
  }

  return parse === undefined ? (json.data as T) : parse(json.data);
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const { baseUrl, timeoutMs, auth } = config;
  const doFetch: typeof fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init));

  async function send(
    method: HttpMethod,
    url: string,
    body: string | undefined,
    options: RequestOptions<unknown>,
    accessToken: string | null,
  ): Promise<RawResponse> {
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (accessToken !== null) headers.set('Authorization', `Bearer ${accessToken}`);

    const timeout = withTimeout(options.signal, options.timeoutMs ?? timeoutMs);
    try {
      const response = await doFetch(url, {
        method,
        headers,
        body: body ?? null,
        signal: timeout.signal,
        // Auth is header-based; never send cookies to the API.
        credentials: 'omit',
      });
      return { status: response.status, ok: response.ok, text: await response.text() };
    } catch (error) {
      if (timeout.didTimeOut()) throw new TimeoutError('Request timed out', { cause: error });
      if (options.signal?.aborted === true) throw error; // caller-initiated abort: propagate as-is
      throw new NetworkError('Network request failed', { cause: error });
    } finally {
      timeout.dispose();
    }
  }

  async function request<T>(method: HttpMethod, path: string, options: RequestOptions<T> = {}): Promise<T> {
    const url = buildUrl(baseUrl, path, options.query);
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);

    const token = auth?.getAccessToken() ?? null;
    let response = await send(method, url, body, options, token);

    // A 401 means the guard rejected the request before it was processed,
    // so a single retry with a renewed token is safe for any method.
    if (response.status === 401 && auth !== undefined) {
      const renewed = await auth.refreshAccessToken(token);
      if (renewed !== null && renewed !== token) {
        response = await send(method, url, body, options, renewed);
      }
    }

    return readEnvelope(response, options.parse);
  }

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
  };
}
