/**
 * documents.* — upload, uploadBatch, list (SDK 0.3.0, B.6).
 *
 * Ingestion is the canonical async path: presign → PUT(S3) → confirm. Bytes go
 * DIRECT to S3 (never through the RIGA backend — the real large-file fix); the
 * `document.uploaded` chain event commits asynchronously after the confirm.
 *
 *   client.documents.upload(roomId, file)        — one file, async-eventual
 *   client.documents.uploadBatch(roomId, files)  — client-side fan-out (bulk)
 *   client.documents.list(roomId, folderId?)     — agent-principal, can_view-scoped
 *   client.documents.evidenceBundle(id)          — bytes-binding disclosure (ADR 0061)
 *
 * Uploads are INTEGRATOR-principal: the document is recorded against the human
 * who minted the key (the substrate has no agent-attribution slot for documents).
 */

import {
  documentsV1ControllerEvidenceBundle,
  roomDocumentsV1ControllerConfirm,
  roomDocumentsV1ControllerList,
  roomDocumentsV1ControllerPresign,
} from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';
import { roomDocumentsV1ControllerUpload } from '../generated/index.js';
import { RigaNetworkError } from '../errors.js';

export interface UploadFile {
  /** File bytes. */
  data: Uint8Array | Blob;
  /** Filename (stored as the document name). */
  filename: string;
  /** MIME type — also sent as the S3 PUT Content-Type. */
  mimeType: string;
  /** Target folder UUID. Omit for the root (owners only). */
  folderId?: string;
  /** Task UUID this document fulfills (optional). */
  fulfillsTaskId?: string;
}

export interface UploadHandle {
  /** The document id — stable from presign onward. */
  fileId: string;
  /** Processing status. 'processing' = `document.uploaded` commits asynchronously. */
  status: string;
  /** The dataroom this document belongs to. */
  dataroomId: string;
}

export type BatchResult =
  | { ok: true; handle: UploadHandle }
  | { ok: false; filename: string; error: Error };

/**
 * The VAL bytes-binding evidence bundle (ADR 0061) — the disclosure an offline
 * auditor feeds to the verifier's Pass 6 to prove the chain content-address
 * binds to THIS document, byte-for-byte, with zero RIGA trust.
 */
export interface EvidenceBundle {
  /** Base64 of the literal stored document bytes. Independently hash these — never trust a RIGA-supplied digest. */
  document_bytes_base64: string;
  /** The opening nonce for the commitment — disclosed ONLY here, never on the chain (not a cross-tenant oracle). */
  bytes_commitment_nonce: string;
  /** The on-chain commitment value this bundle lets you re-derive: SHA-256("val.bytes-commitment.v1"‖0x00‖nonce‖SHA-256(bytes)). */
  bytes_commitment: string;
  /** The chain content-address (DEK-keyed HMAC-SHA256 — confidentiality/dedup, NOT the bytes proof). */
  content_hash: string;
}

export class DocumentsResource {
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Upload one file via presign → PUT(S3) → confirm. Returns a handle as soon as
   * async processing is triggered; the chain event lands shortly after (poll
   * `documents.list` to observe it commit).
   */
  async upload(dataroomId: string, file: UploadFile): Promise<UploadHandle> {
    const size = file.data instanceof Uint8Array ? file.data.byteLength : file.data.size;

    // 1. presign — get a direct-to-S3 PUT URL + the document id.
    const presignBody: Record<string, unknown> = {
      filename: file.filename,
      size,
      mimeType: file.mimeType,
    };
    if (file.folderId) presignBody.folderId = file.folderId;
    if (file.fulfillsTaskId) presignBody.fulfillsTaskId = file.fulfillsTaskId;
    const presign = await callApi<{ presignedUrl: string; fileId: string; stagingKey: string }>(
      this.ctx,
      roomDocumentsV1ControllerPresign as unknown as GeneratedFn,
      { path: { roomId: dataroomId }, body: presignBody },
    );

    // 2. PUT the bytes straight to S3 (backend never sees them).
    let putRes: Response;
    try {
      putRes = await this.ctx.fetchImpl(presign.presignedUrl, {
        method: 'PUT',
        body: file.data as BodyInit,
        headers: { 'Content-Type': file.mimeType },
      });
    } catch (e) {
      throw new RigaNetworkError(`S3 upload failed: ${(e as Error).message}`);
    }
    if (!putRes.ok) {
      throw new RigaNetworkError(`S3 upload failed: HTTP ${putRes.status}`);
    }

    // 3. confirm — triggers async processing (DEK encrypt + emit document.uploaded).
    const confirm = await callApi<{ status: string; fileId: string }>(
      this.ctx,
      roomDocumentsV1ControllerConfirm as unknown as GeneratedFn,
      { path: { roomId: dataroomId }, body: { fileId: presign.fileId } },
    );
    return { fileId: confirm.fileId, status: confirm.status, dataroomId };
  }

  /**
   * Upload many files via bounded client-side fan-out over `upload`. This is the
   * bulk / large-migration path: each file goes direct to S3 in parallel, no
   * server-side batch state. Returns one result per file (preserving order) — an
   * `{ ok: true, handle }` or an `{ ok: false, filename, error }`. Concurrency
   * defaults to 5.
   */
  async uploadBatch(
    dataroomId: string,
    files: UploadFile[],
    opts: { concurrency?: number } = {},
  ): Promise<BatchResult[]> {
    const concurrency = Math.max(1, opts.concurrency ?? 5);
    const results: BatchResult[] = new Array(files.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const i = next++;
        if (i >= files.length) return;
        try {
          results[i] = { ok: true, handle: await this.upload(dataroomId, files[i]) };
        } catch (e) {
          results[i] = { ok: false, filename: files[i].filename, error: e as Error };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, files.length) }, () => worker()),
    );
    return results;
  }

  /**
   * Fetch the VAL bytes-binding evidence bundle for a document (ADR 0061).
   *
   * Owner/auditor-grade: requires FGA `can_verify_audit_chain` and the
   * `audit.read` scope — a `cap_user` agent/integrator key is refused (403).
   * Pair it with the chain export (`client.audit.export(roomId).verify()` for
   * the core passes, or the full-workspace `/audit/chain` NDJSON) and feed the
   * disclosure to the published verifier's Pass 6 —
   * `verifyValChain(rows, { bytesDisclosures: [{ event_hash, nonce, bytes }] })`
   * in `@val-protocol/chain-verifier` >= 0.7.0 — to prove `bytesBinding: bound`
   * offline. Independently hash `document_bytes_base64`; do not trust
   * `content_hash` as the bytes proof (it is a DEK-keyed HMAC).
   */
  /**
   * Upload a document in ONE call — the bytes ride the request (base64) and the server drives
   * the presign→confirm chokepoint. Added in SDK 0.7.0 (ADR 0074): `document.upload` is an
   * agent-capable verb, so it ships on REST *and* MCP — this is the REST twin of the
   * `document_upload` MCP tool, delegating to the same server-side carrier.
   *
   * Use {@link upload} for large files (it streams the bytes straight to storage). Scope:
   * `document.upload` (the legacy colon `dataroom:upload` still resolves).
   *
   * The resulting `document.uploaded` chain event is attributed to the ACTING AGENT when an
   * agent drives it (`principal: agent:<sa>`), not relabelled as the human key-holder.
   */
  async uploadInline(
    dataroomId: string,
    file: { filename: string; mimeType: string; contentBase64: string; folderId?: string; fulfillsTaskId?: string },
    opts: { idempotencyKey?: string } = {},
  ): Promise<{ status: 'processing'; file_id: string }> {
    return callApi<{ status: 'processing'; file_id: string }>(
      this.ctx,
      roomDocumentsV1ControllerUpload as unknown as GeneratedFn,
      {
        path: { roomId: dataroomId },
        body: {
          filename: file.filename,
          mime_type: file.mimeType,
          content_base64: file.contentBase64,
          ...(file.folderId ? { folder_id: file.folderId } : {}),
          ...(file.fulfillsTaskId ? { fulfills_task_id: file.fulfillsTaskId } : {}),
        },
      },
      opts.idempotencyKey,
    );
  }

  async evidenceBundle(documentId: string): Promise<EvidenceBundle> {
    return callApi<EvidenceBundle>(
      this.ctx,
      documentsV1ControllerEvidenceBundle as unknown as GeneratedFn,
      { path: { id: documentId } },
    );
  }

  /** List documents the caller can view (optionally scoped to one folder). */
  async list(dataroomId: string, folderId?: string): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {};
    if (folderId) query.folder_id = folderId;
    return callApi<Record<string, unknown>[]>(
      this.ctx,
      roomDocumentsV1ControllerList as unknown as GeneratedFn,
      { path: { roomId: dataroomId }, query },
    );
  }
}
