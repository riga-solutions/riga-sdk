/**
 * parties.* — the negotiation sides of a dataroom, and who sits on them.
 *
 * REST (SDK 0.7.0):
 *   client.parties.list(roomId)                          → GET   /api/v1/datarooms/:id/parties
 *   client.parties.create(roomId, params)                → POST  /api/v1/datarooms/:id/parties
 *   client.parties.update(roomId, partyId, params)       → PATCH /api/v1/datarooms/:id/parties/:partyId
 *   client.parties.members(roomId, partyId)              → GET   …/parties/:partyId/members
 *   client.parties.addMember(roomId, partyId, params)    → POST  …/parties/:partyId/members
 *   client.parties.reassignMember(roomId, participantId, params)
 *                                                        → PATCH …/members/:participantId/reassign
 *
 * A party is a *side* (internal = your side, external = the counterparty), not a person: it is
 * the unit document isolation is enforced against. Manage-tier writes here are agent-reachable by
 * **delegation** — an agent acts under its delegator's grant (`party.manage` scope), never by a
 * hardcoded role. Party *deletion* is an acte de disposition and deliberately has no SDK surface:
 * it requires an express mandate, so it is not delegable by default.
 */

import {
  partiesV1ControllerList,
  partiesV1ControllerCreate,
  partiesV1ControllerUpdate,
  partiesV1ControllerMembers,
  partiesV1ControllerAddMember,
  partiesV1ControllerReassign,
} from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';

export type PartySide = 'internal' | 'external';

export type SystemRole =
  | 'read_only'
  | 'read_print'
  | 'user'
  | 'content_admin'
  | 'administrator';

export interface PartyCreateParams {
  name: string;
  side: PartySide;
  organization_id?: string;
  color?: string;
  /** The tier members of this party inherit unless overridden. Bounds what they — and any agent they delegate to — may do. */
  default_system_role?: SystemRole;
}

export interface PartyUpdateParams {
  name?: string;
  organization_id?: string;
  color?: string;
}

export interface Party {
  id: string;
  name: string;
  side: PartySide;
  [key: string]: unknown;
}

export class PartiesResource {
  constructor(private readonly ctx: ClientContext) {}

  /** Every party in the room. Scope: `dataroom.read`. */
  async list(dataroomId: string): Promise<Party[]> {
    return callApi<Party[]>(
      this.ctx,
      partiesV1ControllerList as unknown as GeneratedFn,
      { path: { dataroomId } },
    );
  }

  /** Create a party (a side). Scope: integrator `dataroom:create` / agent `party.manage`. */
  async create(
    dataroomId: string,
    params: PartyCreateParams,
    opts: { idempotencyKey?: string } = {},
  ): Promise<Party> {
    return callApi<Party>(
      this.ctx,
      partiesV1ControllerCreate as unknown as GeneratedFn,
      { path: { dataroomId }, body: params },
      opts.idempotencyKey,
    );
  }

  /** Rename / recolour / re-org a party. Scope: `party.manage`. */
  async update(
    dataroomId: string,
    partyId: string,
    params: PartyUpdateParams,
    opts: { idempotencyKey?: string } = {},
  ): Promise<Party> {
    return callApi<Party>(
      this.ctx,
      partiesV1ControllerUpdate as unknown as GeneratedFn,
      { path: { dataroomId, partyId }, body: params },
      opts.idempotencyKey,
    );
  }

  /** The participants sitting on this party. Scope: `dataroom.read`. */
  async members(dataroomId: string, partyId: string): Promise<Record<string, unknown>[]> {
    return callApi<Record<string, unknown>[]>(
      this.ctx,
      partiesV1ControllerMembers as unknown as GeneratedFn,
      { path: { dataroomId, partyId } },
    );
  }

  /** Seat an existing participant on this party. Scope: `party.manage`. */
  async addMember(
    dataroomId: string,
    partyId: string,
    params: { participant_id: string },
    opts: { idempotencyKey?: string } = {},
  ): Promise<Record<string, unknown>> {
    return callApi<Record<string, unknown>>(
      this.ctx,
      partiesV1ControllerAddMember as unknown as GeneratedFn,
      { path: { dataroomId, partyId }, body: params },
      opts.idempotencyKey,
    );
  }

  /**
   * Move a participant to another party. This changes what they can reach (party isolation is the
   * document boundary), so it is a manage-tier act. Scope: `party.manage`.
   */
  async reassignMember(
    dataroomId: string,
    participantId: string,
    params: { target_party_id: string },
    opts: { idempotencyKey?: string } = {},
  ): Promise<Record<string, unknown>> {
    return callApi<Record<string, unknown>>(
      this.ctx,
      partiesV1ControllerReassign as unknown as GeneratedFn,
      { path: { dataroomId, participantId }, body: params },
      opts.idempotencyKey,
    );
  }
}
