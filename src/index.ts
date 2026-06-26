/**
 * @riga-solutions/sdk — TypeScript SDK for the RIGA substrate.
 *
 * Public surface re-exports.
 */

export { RigaClient, RigaClientOptions } from './client.js';

export {
  RigaError,
  RigaAuthError,
  RigaScopeError,
  RigaFGAError,
  RigaRateLimitError,
  RigaBudgetExhaustedError,
  RigaCircuitBreakerError,
  RigaNotFoundError,
  RigaValidationError,
  RigaServerError,
  RigaNetworkError,
} from './errors.js';

export type {
  Record,
  RecordCreatedResponse,
  ProvenanceEnvelope,
  ActorType,
  VisibilityKind,
  BindingEffect,
  EvidentiaryLevel,
  SupersessionKind,
  Dataroom,
  DataroomListPage,
  Task,
  TaskStatus,
  TaskPriority,
  TaskCreatedResponse,
  TaskListPage,
  AuditRow,
  AuditRowRecord,
  VerifyResult,
} from './types.js';

export type { RecordAppendParams, RecordAttestParams } from './resources/records.js';
export type { DataroomCreateParams, DataroomListParams } from './resources/datarooms.js';
export type { FolderCreateParams } from './resources/folders.js';
export type { UploadFile, UploadHandle, BatchResult, EvidenceBundle } from './resources/documents.js';
export type { TaskProposeParams, TaskListParams } from './resources/tasks.js';
export type { AuditExportParams } from './resources/audit.js';
export { AuditExportStream } from './resources/audit.js';
