/**
 * mediations.* — open a mediation dataroom in one call.
 *
 * REST (SDK 0.7.0):
 *   client.mediations.open(...) → POST /api/v1/mediations
 *
 * A mediation is a dataroom with `context: 'MEDIATION'` provisioned end-to-end: both parties
 * (seller / buyer), their Lane-A invitations, and the room itself, in a single request. It is
 * therefore a multi-row op — pass an `idempotencyKey` so a retry cannot double-provision.
 *
 * A MEDIATION room has one extra rule at the far end: it **cannot be closed** until every party
 * has accepted the latest resolution (see `resolutions.*`). Attempting closure earlier returns
 * `409 resolution_consent_incomplete`, naming the parties still outstanding.
 */

import { mediationsV1ControllerOpen } from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';

export interface MediationParty {
  email: string;
  name?: string;
}

export interface MediationOpenParams {
  /** The disputed invoice reference — free text, opaque to RIGA. */
  invoice_ref: string;
  title?: string;
  description?: string;
  seller: MediationParty;
  buyer: MediationParty;
}

export interface MediationOpened {
  dataroom_id: string;
  [key: string]: unknown;
}

export class MediationsResource {
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Open a mediation: room + both parties + both Lane-A invitations, atomically.
   * Multi-row op — pass `{ idempotencyKey }` to make retries safe (L4 durable belt).
   */
  async open(
    params: MediationOpenParams,
    opts: { idempotencyKey?: string } = {},
  ): Promise<MediationOpened> {
    return callApi<MediationOpened>(
      this.ctx,
      mediationsV1ControllerOpen as unknown as GeneratedFn,
      { body: params },
      opts.idempotencyKey,
    );
  }
}
