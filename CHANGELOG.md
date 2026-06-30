# Changelog

All notable changes to `@riga-solutions/sdk` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

## 0.6.0

### Added

- `audit.export(...).verify({ anchorTrust })` — opt-in VAL §8 Pass 4 (external anchor). When the caller
  supplies a resolved TSA trust anchor (`{ tsaCertSpkis }`), `verify` additionally runs the full verifier
  and surfaces `anchorBinding` (`verified` / `mismatch` / `not_evaluated`) and `anchors[]` (TSA-attested
  `genTime` + covered range). Default `verify()` is unchanged (integrity-only, backward compatible).

### Changed

- Bump `@val-protocol/chain-verifier` `^0.7.0` → `^0.9.0` (Pass 4 external-anchor + the additive Profile-C
  QES verdict seam; the SDK uses `verifyValChain` with `anchorTrust`).

## 0.5.0

### Added

- **`documents.evidenceBundle(id)`** — fetches the VAL bytes-binding evidence bundle
  (ADR 0061): `{ document_bytes_base64, bytes_commitment_nonce, bytes_commitment, content_hash }`.
  Owner/auditor-grade (FGA `can_verify_audit_chain`, scope `audit.read`). Pair it with a chain
  export and feed `{ event_hash, nonce, bytes }` to `verifyValChain(rows, { bytesDisclosures })`
  (Pass 6) to prove `bytesBinding: bound` offline, with zero RIGA trust. New exported type
  `EvidenceBundle`.

### Changed

- **`@val-protocol/chain-verifier` bumped `^0.6.0` → `^0.7.0`** — Pass 6 (bytes-binding) lives in
  0.7.0. On a `0.x` version `^0.6.0` resolves to `>=0.6.0 <0.7.0`, so the bump is required for the
  verifier's bytes-binding rail to be reachable transitively.
- Regenerated `src/generated` from the current backend OpenAPI — the SDK now tracks the live
  `/api/v1` surface (adds the audit `chain` / `events` / `deliveries` generated clients, available
  for future resource methods).

## 0.4.0

### Fixed

- **`audit` stream `.verify()` now `await`s `verifyChain`.** With the verifier's async API
  (`@val-protocol/chain-verifier` ≥ 0.5.0) an un-awaited call returns a `Promise`, so `result.ok`
  was `undefined` — a silent verification failure (verify never reports a real verdict). Now
  correctly awaited.

### Changed

- **Bumped `@val-protocol/chain-verifier` to `^0.6.0`** (from `^0.2.0`). The verifier is now
  **isomorphic** (Web Crypto, browser-runnable) and its API became **async** at 0.5.0; `^0.2.0`
  (caret-pinned to 0.2.x on a 0.x range) could not resolve it. The SDK's public API and the
  `VerifyResult` shape (`{ ok, firstBadIndex, reason, rowsVerified }`) are unchanged; `^0.6.0`
  also brings the 0.5.0 verdict checks and 0.6.0 `rootSubject` for any direct verifier use.

## 0.3.0

### Added — dataroom / folder / document resources (B.6)

- **`client.datarooms.create({ title, context? })`** — provision a dataroom
  (alongside the existing `get` / `list`).
- **`client.folders.create(roomId, { name, parentId? })`** and
  **`client.folders.list(roomId)`**.
- **`client.documents.upload(roomId, file)`** — full presign → S3 PUT → confirm
  orchestration in one call — plus **`client.documents.uploadBatch(roomId, files)`**
  (client-side fan-out) and **`client.documents.list(roomId)`**.

All additive; generated layer regenerated from the v1 OpenAPI document.

### Changed

- **`@val-protocol/chain-verifier` dependency bumped `^0.1.0` → `^0.2.0`** —
  `audit.export(...).verify()` consumers get the Pass-5-capable verifier
  (delegator authority, VAL §7.2; additive result fields `authority`,
  `firstAuthorityViolation`, `legacyPreAuthorityAssignmentCount`). No SDK API
  change; the caret-on-0.x pin is why 0.2.0 was not picked up automatically.

### Release context

Held since 2026-06-10 pending the agent-attribution rail proof (B.8): the new
upload/share/folder surfaces required chains that attribute the acting agent
end-to-end. The rail closed 2026-06-11 (ADR 0052 — chain-canonical attribution,
zero per-family columns, REVOKE two-sided runtime-proven, anchor-conformance
gate 5/5), clearing the hold.

## 0.2.0

### Changed — transport migrated MCP → REST (ADR 0051)

The SDK now speaks the public REST API (`/api/v1`) instead of the MCP tool
surface. REST is the canonical substrate; the SDK and the MCP server are two
thin adapters over the **same** backend service layer (transport parity is
locked by a class-1 verifier). This is an internal transport change — the
client construction (`new RigaClient({ baseUrl, apiKey })`), the resource
namespaces (`records` / `datarooms` / `tasks` / `audit`), the typed
`snake_case` response shapes, the typed error hierarchy, the retry behaviour,
and `audit.export(...).verify()` are all **unchanged**.

The generated request/response layer is produced from the backend's
v1-scoped OpenAPI document via `@hey-api/openapi-ts` (run `npm run generate`);
a hand-written facade adds the ergonomic resource methods, the typed error
mapping (`parseRestError`, Stripe-shape envelope → typed `RigaError`
subclasses), and the streaming `AuditExportStream`. No new runtime dependency:
the generated fetch client is self-contained.

### Breaking

- **`records.attest(...)` now requires `task_id`.** Attestations must be rooted
  to the authorizing task (VAL §9.2); the REST contract makes `task_id`
  mandatory. Callers passing the previous shape will get a compile-time error.
- `RecordAttestParams` drops `authored_by_actor_type` and `related_record_ids`
  (never part of the attestation write contract) and adds `binding_effect`,
  `grounded_document_hashes`, and the required `task_id`.
- `tasks.list({ dataroom_id })` — `dataroom_id` is now optional; omit it for a
  cross-dataroom sweep of the calling agent's assigned tasks.

### Migration

```diff
- await client.records.attest({ dataroom_id, type, authored_by_party, content });
+ await client.records.attest({ dataroom_id, type, task_id, authored_by_party, content });
```

Point `baseUrl` at the API host (e.g. `https://backend.riga.solutions`) — the
SDK appends `/api/v1/...` paths itself.

## 0.1.5

- Prior MCP-transport line. Typed client over the public MCP surface with
  retry, error hierarchy, and inline chain verification.
