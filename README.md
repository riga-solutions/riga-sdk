# @riga-solutions/sdk

TypeScript SDK for the RIGA substrate. Typed client over the public REST API (`/api/v1`) — records, datarooms, tasks, audit export — with built-in retry, error class hierarchy, idempotency-key handling, and inline chain verification via [@val-protocol/chain-verifier](https://www.npmjs.com/package/@val-protocol/chain-verifier).

> **0.2.0** migrated the transport from the MCP tool surface to REST (`/api/v1`). The public API is unchanged except `records.attest(...)` now requires `task_id`. See [CHANGELOG](./CHANGELOG.md).

## Install

```bash
npm install @riga-solutions/sdk
```

## Quick start

```ts
import { RigaClient } from '@riga-solutions/sdk';

const client = new RigaClient({
  baseUrl: 'https://backend.riga.solutions',
  apiKey: process.env.RIGA_API_KEY,  // riga_sk_…
});

// Append a record
const { record_id, chain_event_id } = await client.records.append({
  dataroom_id: 'e33143e3-7a34-42b6-98f6-e2576d988de4',
  authored_by_party: 'c5314aa0-c2ce-4d3f-a373-8703cedeb10e',
  content: '<encrypted payload>',
  method_hash: '<hex>',
  method_version: '1.0',
  model_id: 'claude-opus-4.7',
  model_provider: 'anthropic',
  inputs_hash: '<hex>',
});

// Provision a dataroom, organize it, upload into it (0.3.0)
const room = await client.datarooms.create({ title: 'Q3 audit workspace' });
const folder = await client.folders.create(room.id as string, { name: 'contracts' });
const handle = await client.documents.upload(room.id as string, {
  filename: 'msa.pdf',
  data: pdfBytes,                        // Uint8Array | Blob — presign → direct-to-S3 PUT → confirm
  mimeType: 'application/pdf',
  folderId: folder.id as string,
});
console.log(handle.fileId, handle.status); // 'processing' — chain event commits async

// List your datarooms
const page = await client.datarooms.list({ limit: 50 });
for (const dr of page.datarooms) console.log(dr.id, dr.title);

// Stream + verify an audit export inline
const stream = client.audit.export('e33143e3-7a34-42b6-98f6-e2576d988de4', { sinceSequenceNumber: 50 });
for await (const row of stream) {
  console.log(row.sequence_number, row.event_type);
}

// Or verify the chain integrity in one call:
const result = await stream.verify();
if (!result.ok) {
  throw new Error(`chain broken at row ${result.firstBadIndex}: ${result.reason}`);
}
console.log(`verified ${result.rowsVerified} rows; chain intact.`);
```

## Auth

Two mutually exclusive paths:

### Primary — raw API key (`riga_sk_`)

For machine-to-machine integrations (cron, scripts, server-side workers, n8n nodes). Matches Stripe's `sk_live_…` pattern.

```ts
new RigaClient({ baseUrl: '…', apiKey: 'riga_sk_…' });
```

### Secondary — pre-issued OAuth access token (`riga_at_`)

For agent integrations where the agent platform handles OAuth-DCR + PKCE externally.

```ts
new RigaClient({ baseUrl: '…', accessToken: 'riga_at_…' });
```

V1 does **not** auto-refresh OAuth tokens — the backend does not currently support the `refresh_token` grant. On 401, the SDK throws `RigaAuthError`; your application handles re-auth via the agent platform's flow.

## Methods

| Resource | Method | REST endpoint | Notes |
|---|---|---|---|
| `records` | `append(params)` | `POST /api/v1/records` | Writes an `ai.draft.proposal` record. `Idempotency-Key` auto-set. |
| `records` | `attest(params)` | `POST /api/v1/records/attest` | Writes attestation-class records. **Requires `task_id`** (VAL §9.2). `Idempotency-Key` auto-set. |
| `records` | `read(record_id)` | `GET /api/v1/records/:id` | Returns the full `Record`, including the 7-field `envelope` on `ai.*` types. |
| `resolutions` | `propose(params)` | `POST /api/v1/resolutions` | Drafts the multi-party resolution record + fans out per-party consent tasks (F5). `Idempotency-Key` supported. The consent *signature* is human-only (ceremony UI) — no API surface. |
| `resolutions` | `consents(record_id, dataroom_id)` | `GET /api/v1/resolutions/:id/consents` | Per-party bond status; the instrument grade per party is legible (typed=A, webauthn=B, qualified=C). |
| `datarooms` | `create({title, context?})` | `POST /api/v1/datarooms` | 0.3.0. Provisions a dataroom; returns its id. `Idempotency-Key` auto-set. |
| `datarooms` | `get(id)` | `GET /api/v1/datarooms/:id` | 0.3.0. |
| `datarooms` | `list({limit?, cursor?})` | `GET /api/v1/datarooms` | Cursor pagination. |
| `folders` | `create(roomId, {name, parentId?})` | `POST /api/v1/datarooms/:roomId/folders` | 0.3.0. `Idempotency-Key` auto-set. |
| `folders` | `list(roomId)` | `GET /api/v1/datarooms/:roomId/folders` | 0.3.0. |
| `documents` | `upload(roomId, file)` | `POST …/documents/presign` → S3 `PUT` → `POST …/documents/confirm` | 0.3.0. Full ingest orchestration in one call; returns a handle at confirm (the `document.uploaded` chain event commits asynchronously). |
| `documents` | `uploadBatch(roomId, files)` | same, fanned out client-side | 0.3.0. Parallel direct-to-S3; per-file success/failure in the result. |
| `documents` | `list(roomId, folderId?)` | `GET /api/v1/datarooms/:roomId/documents` | 0.3.0. |
| `documents` | `evidenceBundle(id)` | `GET /api/v1/documents/:id/evidence-bundle` | 0.5.0. VAL bytes-binding disclosure (ADR 0061): `{ document_bytes_base64, bytes_commitment_nonce, bytes_commitment, content_hash }`. Owner/auditor-grade (FGA `can_verify_audit_chain`, scope `audit.read`). Independently hash the bytes, then re-derive the on-chain commitment via `verifyValChain(rows, { bytesDisclosures })` (Pass 6) → `bytesBinding: bound`, zero RIGA trust. |
| `tasks` | `propose(params)` | `POST /api/v1/tasks` | `Idempotency-Key` auto-set. |
| `tasks` | `list({dataroom_id?, status?, type?, limit?, cursor?})` | `GET /api/v1/tasks` | Omit `dataroom_id` for a cross-dataroom sweep. |
| `sends` | `create(params, {idempotencyKey})` | `POST /api/v1/sends` | 0.7.0. Tracked send (share link). Multi-row op (1 request → N recipients) — pass an idempotency key for the L4 durable belt. Scope `share.send`. |
| `sends` | `list({status?, limit?, cursor?})` | `GET /api/v1/sends` | 0.7.0. **New endpoint** — the REST door that previously existed only as an MCP tool. Scope `send.read`. |
| `sends` | `get(id)` | `GET /api/v1/sends/:id` | 0.7.0. Scope `send.read`. |
| `sends` | `events(id)` | `GET /api/v1/sends/:id/events` | 0.7.0. Chain-backed timeline — created / viewed / downloaded / revoked each have a VAL block behind them (ADR 0074), re-derivable offline from an export. Scope `send.read`. |
| `sends` | `revoke(id, {idempotencyKey})` | `POST /api/v1/sends/:id/revoke` | 0.7.0. Idempotent — an already-revoked send returns `already_revoked: true`, not an error. Emits a MUTATION `cancel`. Scope `send.revoke`. |
| `documents` | `uploadInline(roomId, file, {idempotencyKey})` | `POST /api/v1/datarooms/:roomId/documents` | 0.7.0. One-call ingest — the bytes ride the request (base64) and the server drives presign→confirm. REST twin of the `document_upload` MCP tool (same carrier). Use `upload(...)` for large files. Scope `document.upload`. |
| `mediations` | `open(params, {idempotencyKey})` | `POST /api/v1/mediations` | 0.7.0. Room + both parties + both Lane-A invitations in one call. Multi-row op — pass an idempotency key. A MEDIATION room cannot be closed until every party has accepted the latest resolution. |
| `parties` | `list(roomId)` | `GET /api/v1/datarooms/:id/parties` | 0.7.0. |
| `parties` | `create(roomId, params, {idempotencyKey})` | `POST /api/v1/datarooms/:id/parties` | 0.7.0. A party is a *side* (`internal` / `external`) — the unit document isolation is enforced against. |
| `parties` | `update(roomId, partyId, params, {idempotencyKey})` | `PATCH /api/v1/datarooms/:id/parties/:partyId` | 0.7.0. Manage-tier; agent-reachable by delegation (`party.manage`). |
| `parties` | `members(roomId, partyId)` | `GET …/parties/:partyId/members` | 0.7.0. |
| `parties` | `addMember(roomId, partyId, {participant_id}, {idempotencyKey})` | `POST …/parties/:partyId/members` | 0.7.0. |
| `parties` | `reassignMember(roomId, participantId, {target_party_id}, {idempotencyKey})` | `PATCH …/members/:participantId/reassign` | 0.7.0. Changes what the member can reach (party isolation is the document boundary). |
| `closure` | `startExport(roomId, {idempotencyKey})` | `POST /api/v1/datarooms/:id/closure/export` | 0.7.0. Step 1 of 2 — the evidence export (async); poll with `exportStatus`. |
| `closure` | `exportStatus(roomId, exportId)` | `GET …/closure/export/:exportId` | 0.7.0. |
| `closure` | `close(roomId, {export_id}, {idempotencyKey})` | `POST /api/v1/datarooms/:id/closure/close` | 0.7.0. **IRREVERSIBLE** — destroys the per-dataroom key. Requires a *completed* export's id, so the evidence is in your hands first. MEDIATION rooms refuse with `409 resolution_consent_incomplete` until every party has accepted. |
| `audit` | `export(dataroomId, {sinceSequenceNumber?, limit?})` | `GET /api/v1/datarooms/:id/audit/export` | Returns `AuditExportStream` (AsyncIterable + `.verify()` = pass-1 integrity replay). For the full VAL passes (lineage / scope / grounding / delegator authority), `await verifyValChain(...)` from the bundled `@val-protocol/chain-verifier` (0.7.x as of SDK 0.5.0 — async, browser-runnable, and including Pass 6 bytes-binding) and feed it the same rows. |

## Error handling

Every method throws on failure. Discriminate by typed subclass — never parse error message strings.

```ts
import {
  RigaError,
  RigaAuthError,
  RigaScopeError,
  RigaFGAError,
  RigaRateLimitError,
  RigaBudgetExhaustedError,
  RigaCircuitBreakerError,
  RigaNotFoundError,
} from '@riga-solutions/sdk';

try {
  await client.records.append({ … });
} catch (e) {
  if (e instanceof RigaRateLimitError) {
    console.warn(`rate limited; retry after ${e.retryAfterSeconds}s`);
  } else if (e instanceof RigaBudgetExhaustedError) {
    console.error(`daily budget exhausted; refills in ${e.retryAfterSeconds}s`);
  } else if (e instanceof RigaScopeError) {
    console.error(`missing OAuth scope: ${e.missingScope}`);
  } else if (e instanceof RigaFGAError) {
    console.error(`no ${e.relation} on ${e.object}`);
  } else {
    throw e;
  }
}
```

## Retry policy

| Error class | SDK retries? | Notes |
|---|---|---|
| `RigaRateLimitError` | yes (up to `maxNetworkRetries`) | Honors `retry_after_seconds` from the substrate. |
| `RigaNetworkError` | yes (exponential backoff) | DNS, TCP, TLS failures. |
| `RigaServerError` (HTTP 5xx) | yes | Standard transient-fault assumption. |
| `RigaBudgetExhaustedError` | **no** | Budget exhaustion is operational, not transient. |
| `RigaCircuitBreakerError` | **no** | Breaker tripped intentionally; investigate underlying errors. |
| `RigaAuthError`, `RigaScopeError`, `RigaFGAError`, `RigaNotFoundError`, `RigaValidationError` | **no** | All deterministic failures. |

Configure via `new RigaClient({ maxNetworkRetries: 5 })` (default 3) or per-call.

## Idempotency

Every POST method auto-generates an `Idempotency-Key` (UUID v4) header. Pass your own via the second arg:

```ts
await client.records.append({ … }, { idempotencyKey: 'my-custom-key' });
```

## License

Apache-2.0. See `LICENSE`.
