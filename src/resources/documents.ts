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
 *
 * Uploads are INTEGRATOR-principal: the document is recorded against the human
 * who minted the key (the substrate has no agent-attribution slot for documents).
 */

import {
  roomDocumentsV1ControllerConfirm,
  roomDocumentsV1ControllerList,
  roomDocumentsV1ControllerPresign,
} from '../generated/index.js';
import { ClientContext, callApi, GeneratedFn } from '../http.js';
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
