/**
 * records.* — append, attest, read.
 *
 * REST (SDK 0.2.0): each maps to a generated /api/v1/records operation.
 *   client.records.append(...) → POST /api/v1/records
 *   client.records.attest(...) → POST /api/v1/records/attest
 *   client.records.read(id)    → GET  /api/v1/records/:id
 */

import { recordsV1ControllerAppend, recordsV1ControllerAttest, recordsV1ControllerRead } from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';
import { Record as RigaRecord, RecordCreatedResponse, VisibilityKind, EvidentiaryLevel } from '../types.js';

export interface RecordAppendParams {
  dataroom_id: string;
  authored_by_party: string;
  content: string;
  method_hash: string;
  method_version: string;
  model_id: string;
  model_provider: string;
  inputs_hash: string;
  inputs_pseudonymized?: boolean;
  visibility_kind?: VisibilityKind;
  document_refs?: string[];
  task_id?: string;
  evidentiary_level?: EvidentiaryLevel;
  event_details?: Record<string, unknown>;
}

export interface RecordAttestParams {
  dataroom_id: string;
  type: string;
  /** REQUIRED (VAL §9.2) — the authorizing task this attestation is rooted to. */
  task_id: string;
  authored_by_party: string;
  content: string;
  visibility_kind?: VisibilityKind;
  document_refs?: string[];
  binding_effect?: string;
  evidentiary_level?: EvidentiaryLevel;
  grounded_document_hashes?: string[];
  event_details?: Record<string, unknown>;
}

export class RecordsResource {
  constructor(private readonly ctx: ClientContext) {}

  async append(params: RecordAppendParams, opts: { idempotencyKey?: string } = {}): Promise<RecordCreatedResponse> {
    return callApi<RecordCreatedResponse>(
      this.ctx,
      recordsV1ControllerAppend as unknown as GeneratedFn,
      { body: params },
      opts.idempotencyKey,
    );
  }

  async attest(params: RecordAttestParams, opts: { idempotencyKey?: string } = {}): Promise<RecordCreatedResponse> {
    return callApi<RecordCreatedResponse>(
      this.ctx,
      recordsV1ControllerAttest as unknown as GeneratedFn,
      { body: params },
      opts.idempotencyKey,
    );
  }

  async read(record_id: string): Promise<RigaRecord> {
    return callApi<RigaRecord>(this.ctx, recordsV1ControllerRead as unknown as GeneratedFn, {
      path: { id: record_id },
    });
  }
}
