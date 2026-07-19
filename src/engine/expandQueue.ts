import { Chess } from 'chess.js';
import { ChessDbApi } from '@jalpp/stockfishts';
import { Response } from 'express';
import { MAX_EXPANSION_DEPTH, MAX_EXPANSION_WIDTH, MAX_POSITIONS_QUEUED, ExpandQueueRequest, ExpandQueueResult, BfsNode, ExpandQueueEvent } from './types.js';


function sseWrite(res: Response, payload: ExpandQueueEvent): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export class ExpandQueueService {
  private chessdb: ChessDbApi;

  constructor() {
    this.chessdb = new ChessDbApi();
  }

  async expandStream(req: ExpandQueueRequest, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const result = await this.expand(req, res);

    sseWrite(res, { event: 'done', result });
    res.end();
  }

  async expand(req: ExpandQueueRequest, res?: Response): Promise<ExpandQueueResult> {
    const expansionDepth     = Math.min(req.expansionDepth    ?? 4,  MAX_EXPANSION_DEPTH);
    const expansionWidth     = Math.min(req.expansionWidth    ?? 2,  MAX_EXPANSION_WIDTH);
    const maxPositionsQueued = Math.min(req.maxPositionsQueued ?? MAX_POSITIONS_QUEUED, MAX_POSITIONS_QUEUED);

    let positionsVisited = 0;
    let positionsQueued  = 0;
    let cappedByLimit    = false;
    const errors:     string[] = [];
    const queuedFens: string[] = [];  // accumulates every successfully queued FEN

    const visited  = new Set<string>();
    const frontier: BfsNode[] = [{ fen: req.fen, depth: 0 }];

    outerLoop:
    while (frontier.length > 0) {
      const { fen, depth } = frontier.shift()!;

      if (visited.has(fen)) continue;
      visited.add(fen);
      positionsVisited++;

      if (res) {
        sseWrite(res, {
          event: 'progress',
          fen,
          depth,
          positionsVisited,
          positionsQueued,
          frontierSize: frontier.length,
        });
      }

      const analysis = await this.chessdb.queryAll(fen);

      if (!analysis.success) {
        if (positionsQueued >= maxPositionsQueued) {
          cappedByLimit = true;
          break outerLoop;
        }
        const qr = await this.chessdb.queue(fen);
        if (qr.success) {
          positionsQueued++;
          queuedFens.push(fen);
          if (res) sseWrite(res, { event: 'queued', fen, positionsQueued });
        } else {
          const msg = `Queue failed for unknown position ${fen}`;
          errors.push(msg);
          if (res) sseWrite(res, { event: 'error', message: msg });
        }
        continue;
      }

      const isLeaf   = depth >= expansionDepth;
      const topMoves = analysis.data.slice(0, expansionWidth);

      for (const move of topMoves) {
        const childFen = this.applyUciMove(fen, move.uci);
        if (!childFen) continue;

        if (isLeaf) {
          if (positionsQueued >= maxPositionsQueued) {
            cappedByLimit = true;
            break outerLoop;
          }
          const qr = await this.chessdb.queue(childFen);
          if (qr.success) {
            positionsQueued++;
            queuedFens.push(childFen);
            if (res) sseWrite(res, { event: 'queued', fen: childFen, positionsQueued });
          } else {
            const msg = `Queue failed for ${childFen}`;
            errors.push(msg);
            if (res) sseWrite(res, { event: 'error', message: msg });
          }
        } else {
          if (!visited.has(childFen)) {
            frontier.push({ fen: childFen, depth: depth + 1 });
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      positionsVisited,
      positionsQueued,
      cappedByLimit,
      queuedFens,
      errors,
    };
  }

  private applyUciMove(fen: string, uci: string): string | null {
    try {
      const chess     = new Chess(fen);
      const from      = uci.slice(0, 2) as any;
      const to        = uci.slice(2, 4) as any;
      const promotion = uci.length === 5 ? (uci[4] as any) : undefined;
      const result    = chess.move({ from, to, promotion });
      return result ? chess.fen() : null;
    } catch {
      return null;
    }
  }
}