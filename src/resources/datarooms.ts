/**
 * datarooms.* — create, get, list (SDK 0.2.0 list; 0.3.0 adds create + get, B.6).
 *
 *   client.datarooms.create({ title, context? })   → POST /api/v1/datarooms
 *     Integrator-provisioned: the room is OWNED by the human who minted the key
 *     (resolved server-side). The owner is NOT a client-supplied field.
 *   client.datarooms.get(id)                        → GET  /api/v1/datarooms/:id
 *   client.datarooms.list({ limit?, cursor? })      → GET  /api/v1/datarooms
 *
 * For full enumeration, iterate cursor:
 *   let cursor: string | null = null;
 *   do {
 *     const page = await client.datarooms.list({ limit: 50, cursor });
 *     for (const dr of page.datarooms) handle(dr);
 *     cursor = page.next_cursor;
 *   } while (cursor);
 */

import {
  dataroomsV1ControllerCreate,
  dataroomsV1ControllerGet,
  dataroomsV1ControllerList,
} from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';
import { DataroomListPage } from '../types.js';

export interface DataroomCreateParams {
  /** Human-readable title. */
  title: string;
  /** Governance context (persona-based invitation flow). Optional. */
  context?: string;
  /** Optional description. */
  description?: string;
  /** Optional template UUID to clone folder/task structure from. */
  templateId?: string;
}

export interface DataroomListParams {
  limit?: number;
  cursor?: string;
}

export class DataroomsResource {
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Provision a dataroom. Owner = the key's human provisioner (server-resolved);
   * the agent identity, if any, is recorded as audit attribution. Returns the
   * created dataroom (with its `dataroom.created` chain genesis).
   *
   * Pass an Idempotency-Key to make the create retry-safe.
   */
  async create(
    params: DataroomCreateParams,
    opts: { idempotencyKey?: string } = {},
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { title: params.title };
    if (params.context != null) body.context = params.context;
    if (params.description != null) body.description = params.description;
    if (params.templateId != null) body.templateId = params.templateId;
    return callApi<Record<string, unknown>>(
      this.ctx,
      dataroomsV1ControllerCreate as unknown as GeneratedFn,
      { body },
      opts.idempotencyKey,
    );
  }

  /** Fetch core metadata for a dataroom the caller can view. */
  async get(id: string): Promise<Record<string, unknown>> {
    return callApi<Record<string, unknown>>(
      this.ctx,
      dataroomsV1ControllerGet as unknown as GeneratedFn,
      { path: { id } },
    );
  }

  async list(params: DataroomListParams = {}): Promise<DataroomListPage> {
    const query: Record<string, unknown> = {};
    if (params.limit != null) query.limit = params.limit;
    if (params.cursor) query.cursor = params.cursor;
    return callApi<DataroomListPage>(this.ctx, dataroomsV1ControllerList as unknown as GeneratedFn, { query });
  }
}
