/**
 * audit.* — export (with AsyncIterable + inline .verify()).
 *
 * REST (SDK 0.2.0): GET /api/v1/datarooms/:id/audit/export streams the chain
 * history as application/x-ndjson (one JSON object per line, ADR 0016).
 * Pagination metadata rides on the X-Next-Cursor / X-Count / X-Schema-Version
 * response headers so the body stays pure NDJSON. This stream consumes that wire
 * format directly (via rawNdjson — the generated client would try to JSON-parse
 * the streamed body) and grafts on .verify() using @val-protocol/chain-verifier.
 *
 * Audit-stream affordance:
 *   const stream = client.audit.export(dataroomId, { sinceSequenceNumber: 50 });
 *   for await (const row of stream) { handle(row); }       // iterate row-by-row
 *   const result = await stream.verify();                   // or verify inline
 *   if (!result.ok) throw new Error(`row ${result.firstBadIndex}`);
 *
 * [Symbol.asyncIterator] and .verify() each create a fresh underlying iteration;
 * calling both is safe and produces the same row sequence.
 */

import { verifyChain, ChainRow } from '@val-protocol/chain-verifier';
import { ClientContext, rawNdjson } from '../http.js';
import { AuditRow, VerifyResult } from '../types.js';

export interface AuditExportParams {
  /** Resume from after this sequence_number (exclusive). Catch-up semantics (exclusive cursor). */
  sinceSequenceNumber?: number;
  /** Page size per HTTP call. Default 100, max 1000. */
  limit?: number;
}

function buildPath(
  dataroomId: string,
  args: { since_sequence_number?: number; cursor?: string; limit?: number },
): string {
  const qs = new URLSearchParams();
  if (args.since_sequence_number !== undefined) qs.set('since_sequence_number', String(args.since_sequence_number));
  if (args.cursor) qs.set('cursor', args.cursor);
  if (args.limit) qs.set('limit', String(args.limit));
  const query = qs.toString();
  return `/api/v1/datarooms/${dataroomId}/audit/export${query ? `?${query}` : ''}`;
}

/** Pull one page of the NDJSON export — the parsed rows + the next cursor (X-Next-Cursor header). */
async function pullPage(
  ctx: ClientContext,
  dataroomId: string,
  args: { since_sequence_number?: number; cursor?: string; limit?: number },
): Promise<{ rows: AuditRow[]; nextCursor: string | null }> {
  const { body, nextCursor } = await rawNdjson(ctx, buildPath(dataroomId, args));
  const rows: AuditRow[] =
    body.length === 0
      ? []
      : body
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => JSON.parse(l) as AuditRow);
  return { rows, nextCursor };
}

export class AuditExportStream implements AsyncIterable<AuditRow> {
  constructor(
    private readonly ctx: ClientContext,
    private readonly dataroomId: string,
    private readonly params: AuditExportParams,
  ) {}

  /** AsyncIterable shape — fresh iteration each call to for-await. */
  async *[Symbol.asyncIterator](): AsyncGenerator<AuditRow, void, void> {
    let cursor: string | null = null;
    let firstCall = true;
    for (let page = 0; page < 1000; page += 1) {
      const args: { since_sequence_number?: number; cursor?: string; limit?: number } = {
        limit: this.params.limit,
      };
      if (firstCall) {
        args.since_sequence_number = this.params.sinceSequenceNumber;
        firstCall = false;
      } else if (cursor) {
        args.cursor = cursor;
      }
      const { rows, nextCursor } = await pullPage(this.ctx, this.dataroomId, args);
      for (const row of rows) yield row;
      cursor = nextCursor;
      if (cursor === null) return;
    }
  }

  /**
   * Run the standalone @val-protocol/chain-verifier inline against the streamed
   * NDJSON. Independent iteration — calling .verify() does not consume the
   * for-await iterator and vice versa. Returns the verifier's result enriched
   * with the row count.
   *
   * Audit-stream affordance: this is the load-bearing developer-experience hook
   * for the bâtonnier-replay narrative. The integrator pulls + verifies in one
   * call, no additional setup.
   */
  async verify(): Promise<VerifyResult> {
    const chainRows: ChainRow[] = [];
    for await (const row of this) {
      chainRows.push({
        scope_key: row.scope_key,
        sequence_number: row.sequence_number,
        event_type: row.event_type,
        canonical_details: row.canonical_details,
        previous_hash: row.previous_hash,
        chain_hash: row.chain_hash,
      });
    }
    const result = await verifyChain(chainRows);
    return {
      ok: result.ok,
      firstBadIndex: result.firstBadIndex,
      reason: result.reason,
      rowsVerified: chainRows.length,
    };
  }
}

export class AuditResource {
  constructor(private readonly ctx: ClientContext) {}

  /** Returns an AuditExportStream — both AsyncIterable and equipped with .verify(). */
  export(dataroomId: string, params: AuditExportParams = {}): AuditExportStream {
    return new AuditExportStream(this.ctx, dataroomId, params);
  }
}
