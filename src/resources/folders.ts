/**
 * folders.* — create, list (SDK 0.3.0, B.6).
 *
 *   client.folders.create(roomId, { name, parentId? })  → POST /api/v1/datarooms/:roomId/folders
 *     Integrator-provisioned (authorized as the key's human provisioner).
 *   client.folders.list(roomId)                          → GET  /api/v1/datarooms/:roomId/folders
 *     Agent-principal: only folders the caller can view, with breadcrumb redaction.
 */

import {
  foldersV1ControllerCreate,
  foldersV1ControllerList,
} from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';

export interface FolderCreateParams {
  /** Folder name. */
  name: string;
  /** Parent folder UUID. Omit to create at the dataroom root. */
  parentId?: string;
  /** Optional description. */
  description?: string;
}

export class FoldersResource {
  constructor(private readonly ctx: ClientContext) {}

  async create(
    roomId: string,
    params: FolderCreateParams,
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { name: params.name };
    if (params.parentId != null) body.parent_id = params.parentId;
    if (params.description != null) body.description = params.description;
    return callApi<Record<string, unknown>>(
      this.ctx,
      foldersV1ControllerCreate as unknown as GeneratedFn,
      { path: { roomId }, body },
    );
  }

  async list(roomId: string): Promise<Record<string, unknown>[]> {
    return callApi<Record<string, unknown>[]>(
      this.ctx,
      foldersV1ControllerList as unknown as GeneratedFn,
      { path: { roomId } },
    );
  }
}
