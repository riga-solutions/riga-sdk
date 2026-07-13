/**
 * closure.* — end a dataroom's life: export the evidence, then seal it.
 *
 * REST (SDK 0.7.0):
 *   client.closure.startExport(roomId)              → POST /api/v1/datarooms/:id/closure/export
 *   client.closure.exportStatus(roomId, exportId)   → GET  /api/v1/datarooms/:id/closure/export/:exportId
 *   client.closure.close(roomId, { export_id })     → POST /api/v1/datarooms/:id/closure/close
 *
 * **Closure is IRREVERSIBLE.** It is deliberately a two-step ceremony: you cannot seal a room you
 * have not first exported. `close()` takes the `export_id` of a *completed* export, so the evidence
 * is in your hands before the vault's keys are destroyed — the export is the thing you keep, and
 * it verifies offline with `@val-protocol/chain-verifier` without trusting RIGA.
 *
 * Two refusals worth knowing about, both by design:
 *  - a MEDIATION room refuses to close until **every party** has accepted the latest resolution
 *    (`409 resolution_consent_incomplete`, naming who is outstanding — see `resolutions.*`);
 *  - closing with a stale or unfinished export is refused rather than silently sealing.
 */

import {
  dataroomsV1ControllerStartClosureExport,
  dataroomsV1ControllerClosureExportStatus,
  dataroomsV1ControllerCloseVault,
} from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';

export interface ClosureExportStarted {
  export_id: string;
  status?: string;
  [key: string]: unknown;
}

export interface ClosureExportStatus {
  export_id?: string;
  /** `pending` | `processing` | `completed` | `failed` (server-authoritative). */
  status: string;
  download_url?: string;
  [key: string]: unknown;
}

export interface VaultClosed {
  closed_at?: string;
  [key: string]: unknown;
}

export class ClosureResource {
  constructor(private readonly ctx: ClientContext) {}

  /** Step 1 — kick off the evidence export (async). Returns the `export_id` to poll. */
  async startExport(
    dataroomId: string,
    opts: { idempotencyKey?: string } = {},
  ): Promise<ClosureExportStarted> {
    return callApi<ClosureExportStarted>(
      this.ctx,
      dataroomsV1ControllerStartClosureExport as unknown as GeneratedFn,
      { path: { id: dataroomId } },
      opts.idempotencyKey,
    );
  }

  /** Poll the export until `status` is terminal. */
  async exportStatus(dataroomId: string, exportId: string): Promise<ClosureExportStatus> {
    return callApi<ClosureExportStatus>(
      this.ctx,
      dataroomsV1ControllerClosureExportStatus as unknown as GeneratedFn,
      { path: { id: dataroomId, exportId } },
    );
  }

  /**
   * Step 2 — seal the vault. **IRREVERSIBLE**: the per-dataroom encryption key is destroyed, so the
   * documents become unreadable. Requires the `export_id` of a completed export — take your evidence
   * first. A MEDIATION room refuses (409) until every party has accepted the latest resolution.
   */
  async close(
    dataroomId: string,
    params: { export_id: string },
    opts: { idempotencyKey?: string } = {},
  ): Promise<VaultClosed> {
    return callApi<VaultClosed>(
      this.ctx,
      dataroomsV1ControllerCloseVault as unknown as GeneratedFn,
      { path: { id: dataroomId }, body: params },
      opts.idempotencyKey,
    );
  }
}
