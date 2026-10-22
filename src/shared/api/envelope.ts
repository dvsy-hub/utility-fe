/**
 * Every backend response (success and error) is wrapped in this envelope:
 *
 *   { "result": true,  "error": { "message": "", "code": 0 }, "data": { … } }
 *   { "result": false, "error": { "message": "…", "code": 401, "details": null }, "data": null }
 *
 * Verified against the live API and the OpenAPI spec (see docs/auth.md).
 */
export interface EnvelopeError {
  readonly message: string;
  readonly code: number;
  readonly details?: readonly string[] | string | null;
}

export interface Envelope {
  readonly result: boolean;
  readonly error: EnvelopeError;
  readonly data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDetails(value: unknown): value is readonly string[] | string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

export function isEnvelope(value: unknown): value is Envelope {
  if (!isRecord(value) || typeof value.result !== 'boolean' || !('data' in value)) return false;
  const { error } = value;
  return (
    isRecord(error) && typeof error.message === 'string' && typeof error.code === 'number' && isDetails(error.details)
  );
}
