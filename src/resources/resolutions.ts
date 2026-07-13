/**
 * resolutions.* — the F5 multi-party resolution bond (ADR 0073).
 *
 *   client.resolutions.propose(...)          → POST /api/v1/resolutions
 *   client.resolutions.consents(id, roomId)  → GET  /api/v1/resolutions/:id/consents
 *
 * The DRAFT is agent-delegable (a MUTATION rooted in a live task; grounding
 * auto-threads). The consent SIGNATURE is human-only and has NO API surface —
 * party representatives consent in the ceremony UI, each with the instrument of
 * their choice (typed = Profile A, WebAuthn = B, qualified/QES = C; the chain
 * letter grades the instrument, never a forced floor).
 *
 * Transport note: raw-path calls (not the generated client) until the next
 * OpenAPI regeneration picks the endpoints up; same error mapping + retry
 * semantics as the generated path.
 */
import { ClientContext, rawJson } from '../http.js';

export interface ResolutionProposeParams {
  dataroom_id: string;
  /** Opaque resolution terms — free text and/or JSON; RIGA never interprets. */
  content: string;
  /** The LIVE task the resolution MUTATION roots in (VAL §5.1). */
  task_id: string;
  event_details?: Record<string, unknown>;
}

export interface ResolutionProposeResponse {
  record_id: string;
  type: string;
  content_hash: string;
  fan_out_party_ids: string[];
}

export interface ResolutionPartyConsent {
  party_id: string;
  party_name: string | null;
  side: string | null;
  task_status: string;
  accepted: boolean;
  /** 'typed' (A) | 'webauthn' (B) | qualified alg (C) | null while pending. */
  instrument: string | null;
  consent_chain_hash: string | null;
}

export interface ResolutionConsentStatus {
  record_id: string;
  content_hash: string;
  content: string | null;
  created_at: string;
  is_latest: boolean;
  complete: boolean;
  parties: ResolutionPartyConsent[];
}

export class ResolutionsResource {
  constructor(private readonly ctx: ClientContext) {}

  /** Draft (or re-draft) the resolution — fans out one consent task per party. */
  async propose(
    params: ResolutionProposeParams,
    opts: { idempotencyKey?: string } = {},
  ): Promise<ResolutionProposeResponse> {
    return rawJson<ResolutionProposeResponse>(this.ctx, 'POST', '/api/v1/resolutions', {
      body: params,
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /** Per-party bond status of a resolution version (grade legible per party). */
  async consents(recordId: string, dataroomId: string): Promise<ResolutionConsentStatus> {
    return rawJson<ResolutionConsentStatus>(
      this.ctx,
      'GET',
      `/api/v1/resolutions/${encodeURIComponent(recordId)}/consents?dataroom_id=${encodeURIComponent(dataroomId)}`,
    );
  }
}
