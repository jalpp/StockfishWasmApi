import { PositionEval } from "@jalpp/stockfishts";

export const MAX_POSITIONS_QUEUED = 20;
export const MAX_EXPANSION_DEPTH  = 10;
export const MAX_EXPANSION_WIDTH  = 5;

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
  queuedFens:       string[];  
  errors:           string[];
}

export type ExpandQueueEvent =
  | { event: 'progress'; fen: string; depth: number; positionsVisited: number; positionsQueued: number; frontierSize: number }
  | { event: 'queued';   fen: string; positionsQueued: number }
  | { event: 'error';    message: string }
  | { event: 'done';     result: ExpandQueueResult };

export interface BfsNode {
  fen:   string;
  depth: number;
}


export interface FormatResponse {
    bestmove: string;
    lines: string[];
    isNullMovePosition?: boolean;
}

export interface EvaluationRequest {
    fen: string;
    depth: number;
    multiPv?: number;
}

export interface CacheKey {
  fen: string;
  depth: number;
  multiPv: number;
  nullMove?: boolean;
}

export interface CachedEvalDocument {
  fen: string;
  depth: number;
  multiPv: number;
  nullMove: boolean;
  result: PositionEval;
  createdAt: string;
  lastAccessedAt: string;
  source: string;
}

export interface BatchCacheResult {
  fen: string;
  hit: boolean;
  result?: PositionEval;
}