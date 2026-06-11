/**
 * RIGA SDK error class hierarchy.
 *
 * Every method throws on failure (Stripe/OpenAI/Anthropic convention —
 * reject Supabase's {data, error} shape by design). Integrators
 * discriminate failure modes via instanceof checks against typed subclasses,
 * NOT by parsing error message strings.
 *
 * The hierarchy is populated from the REST Stripe-shape error envelope
 * (`{ error: { type, code, message, param, detail }, request_id }`, ADR 0047)
 * by `parseRestError(status, body, response)` below — status + `error.code`
 * select the typed subclass; the original `error.code` is preserved on `.code`.
 */

export class RigaError extends Error {
  /** Raw error code from the substrate when present (e.g. 'rate_limit_exceeded'). */
  public readonly code?: string;
  /** HTTP status code from the REST response (e.g. 403, 429). */
  public readonly httpStatus?: number;
  /** Raw response body excerpt for debugging. */
  public readonly responseExcerpt?: string;

  constructor(
    message: string,
    opts: { code?: string; httpStatus?: number; responseExcerpt?: string } = {},
  ) {
    super(message);
    this.name = 'RigaError';
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.responseExcerpt = opts.responseExcerpt;
  }
}

/** Bearer token missing, invalid, expired, or revoked. */
export class RigaAuthError extends RigaError {
  constructor(message: string, opts: ConstructorParameters<typeof RigaError>[1] = {}) {
    super(message, opts);
    this.name = 'RigaAuthError';
  }
}

/** Caller's bearer token lacks the OAuth scope required by the tool. */
export class RigaScopeError extends RigaError {
  /** The scope that was missing (e.g. 'agent:audit.read'). */
  public readonly missingScope?: string;
  constructor(message: string, opts: ConstructorParameters<typeof RigaError>[1] & { missingScope?: string } = {}) {
    super(message, opts);
    this.name = 'RigaScopeError';
    this.missingScope = opts.missingScope;
  }
}

/** FGA check failed — caller lacks the relation required on the resource. */
export class RigaFGAError extends RigaError {
  /** The relation that was checked (e.g. 'agent_proposer'). */
  public readonly relation?: string;
  /** The object that was checked (e.g. 'dataroom:<uuid>'). */
  public readonly object?: string;
  constructor(message: string, opts: ConstructorParameters<typeof RigaError>[1] & { relation?: string; object?: string } = {}) {
    super(message, opts);
    this.name = 'RigaFGAError';
    this.relation = opts.relation;
    this.object = opts.object;
  }
}

/**
 * Per-agent request rate limit exceeded.
 * SDK auto-retries this class up to maxNetworkRetries, honoring retryAfterSeconds.
 */
export class RigaRateLimitError extends RigaError {
  public readonly retryAfterSeconds: number;
  constructor(
    message: string,
    opts: ConstructorParameters<typeof RigaError>[1] & { retryAfterSeconds: number },
  ) {
    super(message, opts);
    this.name = 'RigaRateLimitError';
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

/**
 * Per-agent daily euro budget exhausted.
 * SDK does NOT retry — the budget refills daily, the caller must wait.
 */
export class RigaBudgetExhaustedError extends RigaError {
  public readonly retryAfterSeconds: number;
  constructor(
    message: string,
    opts: ConstructorParameters<typeof RigaError>[1] & { retryAfterSeconds: number },
  ) {
    super(message, opts);
    this.name = 'RigaBudgetExhaustedError';
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

/**
 * Per-agent circuit breaker tripped due to elevated error rate.
 * SDK does NOT retry — the trip is intentional, requires cooldown.
 */
export class RigaCircuitBreakerError extends RigaError {
  public readonly retryAfterSeconds: number;
  constructor(
    message: string,
    opts: ConstructorParameters<typeof RigaError>[1] & { retryAfterSeconds: number },
  ) {
    super(message, opts);
    this.name = 'RigaCircuitBreakerError';
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

/** Resource not found (record_id, dataroom_id, etc.). */
export class RigaNotFoundError extends RigaError {
  constructor(message: string, opts: ConstructorParameters<typeof RigaError>[1] = {}) {
    super(message, opts);
    this.name = 'RigaNotFoundError';
  }
}

/** Caller supplied invalid arguments (schema violation, bad uuid, etc.). */
export class RigaValidationError extends RigaError {
  constructor(message: string, opts: ConstructorParameters<typeof RigaError>[1] = {}) {
    super(message, opts);
    this.name = 'RigaValidationError';
  }
}

/** Substrate-side server error (HTTP 5xx or substrate fault). */
export class RigaServerError extends RigaError {
  constructor(message: string, opts: ConstructorParameters<typeof RigaError>[1] = {}) {
    super(message, opts);
    this.name = 'RigaServerError';
  }
}

/** Network failure before any response was received (DNS, TCP, TLS). */
export class RigaNetworkError extends RigaError {
  constructor(message: string, opts: ConstructorParameters<typeof RigaError>[1] = {}) {
    super(message, opts);
    this.name = 'RigaNetworkError';
  }
}

/**
 * Map a REST error response — the Stripe-shape envelope
 * `{ error: { type, code, message, param, detail }, request_id }` (ADR 0047),
 * plus the HTTP status — onto the appropriate typed RigaError.
 *
 * Status → class: 401 Auth · 403 (code='missing_scope') Scope, else FGA ·
 * 404/410 NotFound · 400/422 Validation · 429 RateLimit (retry, Retry-After) ·
 * 5xx Server · else generic. The specific `error.code` is preserved on `.code`.
 */
export function parseRestError(status: number, body: unknown, response?: Response): RigaError {
  const b = (body ?? {}) as {
    error?: { type?: string; code?: string; message?: string; param?: string };
    message?: string;
    error_description?: string;
  };
  const env = b.error ?? {};
  const code = env.code;
  const message = env.message ?? b.message ?? b.error_description ?? `HTTP ${status}`;
  const retryAfter = Number(response?.headers?.get('retry-after') ?? 0);
  const excerpt = safeExcerpt(body);
  const opts = { code, httpStatus: status, responseExcerpt: excerpt };

  switch (status) {
    case 401:
      return new RigaAuthError(message, opts);
    case 403:
      if (code === 'missing_scope') {
        return new RigaScopeError(message, { ...opts, missingScope: env.param });
      }
      return new RigaFGAError(message, opts);
    case 404:
    case 410:
      return new RigaNotFoundError(message, opts);
    case 400:
    case 422:
      return new RigaValidationError(message, opts);
    case 429:
      return new RigaRateLimitError(message, { ...opts, retryAfterSeconds: retryAfter || 1 });
    default:
      if (status >= 500) return new RigaServerError(message, opts);
      return new RigaError(message, opts);
  }
}

function safeExcerpt(body: unknown): string {
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body).slice(0, 500);
  }
}
