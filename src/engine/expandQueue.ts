import { Chess } from 'chess.js';
import { ChessDBService } from './chessdb.js';
import { Response } from 'express';

const MAX_POSITIONS_QUEUED = 20;
const MAX_EXPANSION_DEPTH  = 10;
const MAX_EXPANSION_WIDTH  = 5;

export interface ExpandQueueRequest {
  fen: string;
  expansionDepth?:     number;
  expansionWidth?:     number;
  maxPositionsQueued?: number;
}

export interface ExpandQueueResult {
  success:          boolean;
  positionsVisited: number;
  positionsQueued:  number;
  cappedByLimit:    boolean;
  queuedFens:       string[];  // every FEN successfully sent to ChessDB
  errors:           string[];
}

export type ExpandQueueEvent =
  | { event: 'progress'; fen: string; depth: number; positionsVisited: number; positionsQueued: number; frontierSize: number }
  | { event: 'queued';   fen: string; positionsQueued: number }
  | { event: 'error';    message: string }
  | { event: 'done';     result: ExpandQueueResult };

interface BfsNode {
  fen:   string;
  depth: number;
}

function sseWrite(res: Response, payload: ExpandQueueEvent): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export class ExpandQueueService {
  private chessdb: ChessDBService;

  constructor() {
    this.chessdb = new ChessDBService();
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

      const analysis = await this.chessdb.getAnalysis(fen);

      if (analysis.error || !analysis.data || analysis.data.moves.length === 0) {
        if (positionsQueued >= maxPositionsQueued) {
          cappedByLimit = true;
          break outerLoop;
        }
        const qr = await this.chessdb.queueAnalysis(fen);
        if (qr.success) {
          positionsQueued++;
          queuedFens.push(fen);
          if (res) sseWrite(res, { event: 'queued', fen, positionsQueued });
        } else {
          const msg = `Queue failed for unknown position ${fen}: ${qr.error}`;
          errors.push(msg);
          if (res) sseWrite(res, { event: 'error', message: msg });
        }
        continue;
      }

      const isLeaf   = depth >= expansionDepth;
      const topMoves = analysis.data.moves.slice(0, expansionWidth);

      for (const move of topMoves) {
        const childFen = this.applyUciMove(fen, move.uci);
        if (!childFen) continue;

        if (isLeaf) {
          if (positionsQueued >= maxPositionsQueued) {
            cappedByLimit = true;
            break outerLoop;
          }
          const qr = await this.chessdb.queueAnalysis(childFen);
          if (qr.success) {
            positionsQueued++;
            queuedFens.push(childFen);
            if (res) sseWrite(res, { event: 'queued', fen: childFen, positionsQueued });
          } else {
            const msg = `Queue failed for ${childFen}: ${qr.error}`;
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