/**
 * http.ts — the thin runtime the facade resources call (Phase B.5 / SDK 0.2.0).
 *
 * Wraps the generated (hey-api) REST client: a per-RigaClient client instance,
 * a `callApi` helper that maps the {data, error, response} result onto the typed
 * RigaError hierarchy + retries 429s, and a `rawNdjson` helper for the streamed
 * audit export (which is application/x-ndjson, not JSON, so it bypasses the
 * generated JSON-parsing path). This file is the ONLY transport code now — the
 * old MCP JSON-RPC transport is gone.
 */
import { createClient, createConfig } from './generated/client/index.js';
import { RigaNetworkError, RigaRateLimitError, parseRestError } from './errors.js';

export interface ClientContext {
  http: ReturnType<typeof createClient>;
  baseUrl: string;
  authHeader: string;
  maxRetries: number;
  fetchImpl: typeof fetch;
}

export function createContext(opts: {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
  maxNetworkRetries?: number;
  fetchImpl?: typeof fetch;
}): ClientContext {
  const token = opts.apiKey ?? opts.accessToken ?? '';
  const authHeader = `Bearer ${token}`;
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const fetchImpl = opts.fetchImpl ?? fetch;
  const http = createClient(
    createConfig({
      baseUrl,
      headers: { Authorization: authHeader },
      throwOnError: false,
    }),
  );
  return { http, baseUrl, authHeader, maxRetries: opts.maxNetworkRetries ?? 2, fetchImpl };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Shape of a generated hey-api operation function (throwOnError: false). */
export type GeneratedFn = (
  options: Record<string, unknown>,
) => Promise<{ data?: unknown; error?: unknown; response: Response }>;

/**
 * Call a generated operation, map failures to typed RigaErrors, and retry 429s
 * up to maxRetries (honouring Retry-After). Returns the parsed response body.
 */
export async function callApi<T>(
  ctx: ClientContext,
  fn: GeneratedFn,
  options: Record<string, unknown> = {},
  idempotencyKey?: string,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    let result: { data?: unknown; error?: unknown; response: Response };
    try {
      result = await fn({
        ...options,
        client: ctx.http,
        throwOnError: false,
        ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
      });
    } catch (e) {
      throw new RigaNetworkError((e as Error).message);
    }
    if (result.response.ok) return result.data as T;
    const err = parseRestError(result.response.status, result.error ?? result.data, result.response);
    if (err instanceof RigaRateLimitError && attempt < ctx.maxRetries) {
      attempt += 1;
      await sleep((err.retryAfterSeconds || 1) * 1000);
      continue;
    }
    throw err;
  }
}

/**
 * Raw JSON call for endpoints not yet in the generated client (regenerate the
 * OpenAPI client to migrate them onto the typed path). Same error mapping +
 * 429-retry semantics as callApi.
 */
export async function rawJson<T>(
  ctx: ClientContext,
  method: 'GET' | 'POST',
  path: string,
  opts: { body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await ctx.fetchImpl(`${ctx.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: ctx.authHeader,
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch (e) {
      throw new RigaNetworkError((e as Error).message);
    }
    if (res.ok) {
      return (await res.json()) as T;
    }
    let errBody: unknown = null;
    try {
      errBody = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const err = parseRestError(res.status, errBody, res);
    if (err instanceof RigaRateLimitError && attempt < ctx.maxRetries) {
      attempt += 1;
      await sleep((err.retryAfterSeconds || 1) * 1000);
      continue;
    }
    throw err;
  }
}

/**
 * Raw GET for the NDJSON audit export. Returns the raw body + the X-Next-Cursor
 * header (the generated client would try to JSON-parse a streamed body).
 */
export async function rawNdjson(
  ctx: ClientContext,
  path: string,
): Promise<{ body: string; nextCursor: string | null }> {
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await ctx.fetchImpl(`${ctx.baseUrl}${path}`, { headers: { Authorization: ctx.authHeader } });
    } catch (e) {
      throw new RigaNetworkError((e as Error).message);
    }
    if (res.ok) {
      const body = await res.text();
      const nc = res.headers.get('X-Next-Cursor');
      return { body, nextCursor: nc && nc.length > 0 ? nc : null };
    }
    let errBody: unknown = null;
    try {
      errBody = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const err = parseRestError(res.status, errBody, res);
    if (err instanceof RigaRateLimitError && attempt < ctx.maxRetries) {
      attempt += 1;
      await sleep((err.retryAfterSeconds || 1) * 1000);
      continue;
    }
    throw err;
  }
}
