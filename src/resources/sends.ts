/**
 * sends.* — the tracked-send (share-link) family.
 *
 * REST (SDK 0.7.0):
 *   client.sends.create(...)  → POST /api/v1/sends
 *   client.sends.list(...)    → GET  /api/v1/sends
 *   client.sends.get(...)     → GET  /api/v1/sends/:id
 *   client.sends.events(...)  → GET  /api/v1/sends/:id/events
 *   client.sends.revoke(...)  → POST /api/v1/sends/:id/revoke
 *
 * The send verbs are a REST+MCP **parity family** (ADR 0074, 2026-07-13): every operation an
 * agent can drive over MCP is reachable here over REST, and both transports delegate to the
 * same server-side carrier. Scopes are the canonical dot form — `share.send`, `send.read`,
 * `send.revoke`; the legacy colon spellings (`share:send`, `send:create`, `send:read`,
 * `send:revoke`) still resolve server-side, so existing integrator keys keep working.
 *
 * What the chain records (ADR 0074): a send co-mints a per-recipient ASSIGNMENT (the share
 * token IS a delegation instrument), the send itself is a COMMUNICATION block, each recipient
 * open is an ACCESS block, and a revocation is a MUTATION `cancel`. The events returned by
 * `events()` are therefore chain-backed, not database-trust — an auditor can re-derive them
 * offline from an export with `@val-protocol/chain-verifier`.
 */

import {
  sendsV1ControllerCreate,
  sendsV1ControllerList,
  sendsV1ControllerGet,
  sendsV1ControllerEvents,
  sendsV1ControllerRevoke,
} from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';

/** How the bytes reach the server: an https URL it fetches, or inline base64. */
export interface SendDocumentInput {
  source: 'url' | 'base64';
  /** For `source: 'url'` a fully qualified https:// URL (server-side SSRF-guarded); for `base64`, the encoded bytes. */
  content: string;
  filename: string;
  mime_type: string;
}

export interface SendSettings {
  allow_download?: boolean;
  allow_print?: boolean;
  watermark_enabled?: boolean;
  max_views?: number;
  passcode?: string;
  allowed_ips?: string[];
  email_gate_enabled?: boolean;
}

export interface SendCreateParams {
  document: SendDocumentInput;
  recipient_email?: string;
  matter_label?: string;
  /** 1–90; defaults server-side. Becomes the recipient grant's `win.not_after` — expiry is chain-enforced. */
  expires_in_days?: number;
  settings?: SendSettings;
}

export interface SendListParams {
  status?: 'active' | 'expired' | 'revoked';
  limit?: number;
  cursor?: string;
}

export interface Send {
  id: string;
  token: string;
  share_url: string;
  matter_label: string | null;
  status: 'active' | 'expired' | 'revoked';
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  download_count: number;
  livemode?: boolean;
  dataroom_id?: string;
  recipient_email?: string | null;
  documents?: Array<{ id: string; name: string; size: number; mime_type: string }>;
}

export interface SendListPage {
  sends: Send[];
  next_cursor: string | null;
}

export interface SendEvent {
  /** `created` | `viewed` | `downloaded` | `revoked` */
  type: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SendEvents {
  events: SendEvent[];
  totals: { view_count: number; download_count: number };
}

export interface SendRevokeResult {
  id: string;
  revoked_at: string;
  /** True when the send was already revoked — an honest no-op, not an error. */
  already_revoked: boolean;
}

export class SendsResource {
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Create a tracked send. Scope: `share.send`.
   * Multi-recipient sends are one request → N substrate writes, so pass an `idempotencyKey`
   * to make retries safe (the server carries an L4 durable belt).
   */
  async create(params: SendCreateParams, opts: { idempotencyKey?: string } = {}): Promise<Send> {
    return callApi<Send>(
      this.ctx,
      sendsV1ControllerCreate as unknown as GeneratedFn,
      { body: params },
      opts.idempotencyKey,
    );
  }

  /** List the sends created by this principal, newest first. Scope: `send.read`. */
  async list(params: SendListParams = {}): Promise<SendListPage> {
    return callApi<SendListPage>(
      this.ctx,
      sendsV1ControllerList as unknown as GeneratedFn,
      { query: params },
    );
  }

  /** Fetch one send's status. Scope: `send.read`. */
  async get(id: string): Promise<Send> {
    return callApi<Send>(
      this.ctx,
      sendsV1ControllerGet as unknown as GeneratedFn,
      { path: { id } },
    );
  }

  /**
   * The send's event timeline — created / viewed / downloaded / revoked.
   * Chain-backed (ADR 0074): each event has a VAL block behind it. Scope: `send.read`.
   */
  async events(id: string): Promise<SendEvents> {
    return callApi<SendEvents>(
      this.ctx,
      sendsV1ControllerEvents as unknown as GeneratedFn,
      { path: { id } },
    );
  }

  /**
   * Revoke a send — the recipient link dies immediately. Idempotent: revoking an
   * already-revoked send returns `already_revoked: true` rather than erroring.
   * Emits a MUTATION `cancel` on the chain. Scope: `send.revoke`.
   */
  async revoke(id: string, opts: { idempotencyKey?: string } = {}): Promise<SendRevokeResult> {
    return callApi<SendRevokeResult>(
      this.ctx,
      sendsV1ControllerRevoke as unknown as GeneratedFn,
      { path: { id } },
      opts.idempotencyKey,
    );
  }
}
