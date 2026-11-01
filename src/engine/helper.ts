import { PositionEval } from "@jalpp/stockfishts";
import { CacheKey, ExpandQueueEvent } from "./types.js";
import { Response } from 'express';

export function sseWrite(res: Response, payload: ExpandQueueEvent): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function normaliseFen(fen: string): string {
  return fen.trim().split(" ").slice(0, 4).join(" ");
}

export function sanitizePositionEval(result: PositionEval): PositionEval {
  return JSON.parse(JSON.stringify(result));
}


export function buildDocId(key: CacheKey): string {
  const fenPart = normaliseFen(key.fen).replace(/\//g, "|").replace(/ /g, "_");
  const nmSuffix = key.nullMove ? "__nm1" : "__nm0";
  return `${fenPart}__d${key.depth}__pv${key.multiPv}${nmSuffix}`;
}


const DISABLE_FIRESTORE_CACHE = (() => {
  const v = process.env.DEV ?? process.env.DISABLE_FIRESTORE_CACHE;
  if (v === undefined || v === null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true";
})();

export const COLLECTION = "sf_cache";

export function getFireStoreCache() {
    return DISABLE_FIRESTORE_CACHE;
}