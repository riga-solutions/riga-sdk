/**
 * RigaClient — public client class.
 *
 * Auth: two paths (mutually exclusive):
 *   primary:   new RigaClient({ baseUrl, apiKey: 'riga_sk_...' })
 *   secondary: new RigaClient({ baseUrl, accessToken: 'riga_at_...' })
 *
 * Resources are nouns mapped to noun-grouped method namespaces:
 *   client.records.{append, attest, read}
 *   client.datarooms.{create, get, list}
 *   client.folders.{create, list}
 *   client.documents.{upload, uploadBatch, list}
 *   client.tasks.{propose, list}
 *   client.audit.{export}  // export returns AsyncIterable with .verify()
 */

import { createContext, ClientContext } from './http.js';
import { RecordsResource } from './resources/records.js';
import { DataroomsResource } from './resources/datarooms.js';
import { FoldersResource } from './resources/folders.js';
import { DocumentsResource } from './resources/documents.js';
import { TasksResource } from './resources/tasks.js';
import { AuditResource } from './resources/audit.js';
import { ResolutionsResource } from './resources/resolutions.js';
import { SendsResource } from './resources/sends.js';
import { MediationsResource } from './resources/mediations.js';
import { PartiesResource } from './resources/parties.js';
import { ClosureResource } from './resources/closure.js';

export interface RigaClientOptions {
  /** API base URL, e.g. 'https://backend.riga.solutions' (host only — the SDK appends /api/v1/... paths). */
  baseUrl: string;
  /** Raw secret key (riga_sk_...). Primary auth path. */
  apiKey?: string;
  /** Pre-issued OAuth access token (riga_at_...). Secondary auth path; no auto-refresh in V1. */
  accessToken?: string;
  /** Max retries on transient failures (network errors, 5xx, 429). Default 3. */
  maxNetworkRetries?: number;
  /** Per-call timeout in milliseconds. Default 60_000. */
  timeoutMs?: number;
  /** Custom fetch (for tests / mocking). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

export class RigaClient {
  public readonly records: RecordsResource;
  public readonly datarooms: DataroomsResource;
  public readonly folders: FoldersResource;
  public readonly documents: DocumentsResource;
  public readonly tasks: TasksResource;
  public readonly audit: AuditResource;
  public readonly resolutions: ResolutionsResource;
  /** Tracked sends (share links) — create / list / get / events / revoke. REST+MCP parity family (ADR 0074). */
  public readonly sends: SendsResource;
  /** Open a mediation (room + both parties + invitations) in one call. */
  public readonly mediations: MediationsResource;
  /** Negotiation sides and their members — the unit document isolation is enforced against. */
  public readonly parties: PartiesResource;
  /** Export the evidence, then seal the vault (IRREVERSIBLE, two-step by design). */
  public readonly closure: ClosureResource;

  private readonly ctx: ClientContext;

  constructor(options: RigaClientOptions) {
    this.ctx = createContext({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      accessToken: options.accessToken,
      maxNetworkRetries: options.maxNetworkRetries,
      fetchImpl: options.fetchImpl,
    });
    this.records = new RecordsResource(this.ctx);
    this.datarooms = new DataroomsResource(this.ctx);
    this.folders = new FoldersResource(this.ctx);
    this.documents = new DocumentsResource(this.ctx);
    this.tasks = new TasksResource(this.ctx);
    this.audit = new AuditResource(this.ctx);
    this.resolutions = new ResolutionsResource(this.ctx);
    this.sends = new SendsResource(this.ctx);
    this.mediations = new MediationsResource(this.ctx);
    this.parties = new PartiesResource(this.ctx);
    this.closure = new ClosureResource(this.ctx);
  }
}
