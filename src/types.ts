/**
 * Public typed response shapes returned by RIGA SDK methods.
 *
 * Types are deliberately conservative — every field covers the write surface,
 * the read surface, and the audit-export NDJSON stream
 * is present. Subkey unions follow the substrate's catalog enums; integrators
 * get autocomplete + compile-time mistakes-as-errors.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Records
// ─────────────────────────────────────────────────────────────────────────────

export type ActorType = 'user' | 'system' | 'ai' | 'counterparty';
export type VisibilityKind = 'all_parties' | 'internal_only' | 'party_scoped' | 'explicit_list';
export type BindingEffect = 'declarative' | 'attestation' | 'engaging' | 'non_binding';
export type EvidentiaryLevel = 'declarative' | 'acknowledged' | 'signed' | 'notarial';
export type SupersessionKind = 'correction' | 'retraction' | 'ratification';

/** 7-field provenance envelope for ai.* records. */
export interface ProvenanceEnvelope {
  method_hash: string;
  method_version: string;
  model_id: string;
  model_provider: string;
  inputs_hash: string;
  agent_actor_id: string;
  inputs_pseudonymized: boolean;
}

/** Returned by records.append / records.attest — the new record + chain anchor. */
export interface RecordCreatedResponse {
  record_id: string;
  chain_event_id: string;
}

/** Returned by records.read — full record state. */
export interface Record {
  record_id: string;
  type: string;
  dataroom_id: string;
  authored_by_party: string;
  authored_by_actor_type: ActorType;
  content_encrypted: string;
  content_hash: string;
  visibility_kind: VisibilityKind;
  document_refs: string[];
  related_record_ids: string[];
  binding_effect: BindingEffect | null;
  evidentiary_level: EvidentiaryLevel | null;
  chain_event_id: string;
  superseded_by: string | null;
  supersession_kind: SupersessionKind | null;
  created_at: string;
  published_at: string | null;
  envelope: ProvenanceEnvelope | null;
  human_ratifier_party_id: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Datarooms
// ─────────────────────────────────────────────────────────────────────────────

export interface Dataroom {
  id: string;
  title: string;
  organization_id: string;
  created_at: string;
}

export interface DataroomListPage {
  datarooms: Dataroom[];
  next_cursor: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface TaskCreatedResponse {
  task_id: string;
}

export interface Task {
  task_id: string;
  type: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  party_id: string | null;
  document_id: string | null;
  folder_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string;
  created_by_type: string;
}

export interface TaskListPage {
  tasks: Task[];
  next_cursor: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit export
// ─────────────────────────────────────────────────────────────────────────────

/** One row of the audit-export NDJSON stream — schema locked by the audit-export wire format. */
export interface AuditRow {
  scope_key: string;
  sequence_number: number;
  event_id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  created_at: string;
  canonical_details: string;
  previous_hash: string | null;
  chain_hash: string;
  record: AuditRowRecord | null;
}

export interface AuditRowRecord {
  record_id: string;
  type: string;
  content_hash: string;
  authored_by_party: string;
  authored_by_actor_type: ActorType;
  document_refs: string[];
  envelope: ProvenanceEnvelope | null;
}

/** Result of running chain-verifier on the audit stream. */
export interface VerifyResult {
  ok: boolean;
  firstBadIndex: number | null;
  reason: string | null;
  rowsVerified: number;
  /**
   * VAL §8 Pass 4 (external anchor) — present only when `verify({ anchorTrust })` is supplied.
   * `verified` = every ANCHOR block's checkpoint root + RFC 3161 token verified against the pinned
   * TSA cert(s); `mismatch` = one failed; `not_evaluated` = no ANCHOR block or no trust anchor.
   */
  anchorBinding?: 'verified' | 'mismatch' | 'not_evaluated';
  /** Per verified ANCHOR: the TSA-attested `genTime` (ISO 8601) and the covered block range. */
  anchors?: Array<{ sequenceNumber: string; genTime: string; covered_range: { from_sequence: number; to_sequence: number } }>;
}
