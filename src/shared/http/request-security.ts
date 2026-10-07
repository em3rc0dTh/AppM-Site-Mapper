export type JsonBodyError =
  | 'INVALID_CONTENT_TYPE'
  | 'JSON_TOO_LARGE'
  | 'INVALID_JSON'
  | 'JSON_TOO_DEEP'
  | 'JSON_TOO_COMPLEX'
  | 'UNSAFE_JSON_KEY';

export type JsonBodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: JsonBodyError };

export interface JsonBodyLimits {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);

function inspectJsonShape(
  value: unknown,
  maxDepth: number,
  maxNodes: number,
): JsonBodyError | null {
  let nodes = 0;

  const visit = (current: unknown, depth: number): JsonBodyError | null => {
    nodes += 1;
    if (nodes > maxNodes) return 'JSON_TOO_COMPLEX';
    if (depth > maxDepth) return 'JSON_TOO_DEEP';

    if (Array.isArray(current)) {
      for (const item of current) {
        const error = visit(item, depth + 1);
        if (error) return error;
      }
      return null;
    }

    if (current && typeof current === 'object') {
      for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
        if (dangerousKeys.has(key)) return 'UNSAFE_JSON_KEY';
        const error = visit(nested, depth + 1);
        if (error) return error;
      }
    }

    return null;
  };

  return visit(value, 0);
}

export async function readBoundedJson(
  request: Request,
  limits: JsonBodyLimits = {},
): Promise<JsonBodyResult> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    return { ok: false, error: 'INVALID_CONTENT_TYPE' };
  }

  const maxBytes = limits.maxBytes ?? 32_768;
  const maxDepth = limits.maxDepth ?? 12;
  const maxNodes = limits.maxNodes ?? 2_000;

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, error: 'JSON_TOO_LARGE' };
  }

  const body = request.body;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  if (body) {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel('JSON_TOO_LARGE');
          return { ok: false, error: 'JSON_TOO_LARGE' };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }

  const shapeError = inspectJsonShape(value, maxDepth, maxNodes);
  return shapeError ? { ok: false, error: shapeError } : { ok: true, value };
}

/** Cookie-authenticated browser mutations must not accept cross-site requests. */
export function isSafeMutationRequest(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function jsonBodyErrorStatus(error: JsonBodyError): number {
  return error === 'JSON_TOO_LARGE' ? 413 : 400;
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isBoundedString(
  value: unknown,
  maxLength: number,
  options: Readonly<{ allowEmpty?: boolean }> = {},
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    (options.allowEmpty === true || value.trim().length > 0)
  );
}
