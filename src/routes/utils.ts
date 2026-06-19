import { validateFen as vfen } from "chess.js";

export const MAX_DEPTH = 30;
export const MIN_DEPTH = 1;
export const MAX_BATCH_SIZE = 25;
export const MAX_MULTI_PV = 5;
export const MIN_MULTI_PV = 1;


export function clampDepth(depth: unknown, defaultDepth = 15): number {
  const d = Number(depth);
  if (isNaN(d) || !Number.isInteger(d)) return defaultDepth;
  return Math.min(Math.max(d, MIN_DEPTH), MAX_DEPTH);
}

export function validateMultiPv(multiPv: unknown, defaultVal = 1): number {
  const v = Number(multiPv);
  if (isNaN(v) || !Number.isInteger(v)) return defaultVal;
  return Math.min(Math.max(v, MIN_MULTI_PV), MAX_MULTI_PV);
}

/**
 * Validates a FEN string using chess.js.
 * Returns an error message string on failure, or null if the FEN is valid.
 */
export function validateFen(fen: unknown): string | null {
  if (!fen || typeof fen !== "string" || fen.trim() === "") {
    return "FEN is required and must be a non-empty string.";
  }
  try {
    const result = vfen(fen.trim());
    if (!result.ok) {
      return `Invalid FEN: ${result.error}`;
    }
  } catch {
    return "Invalid FEN: could not be parsed.";
  }
  return null;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isVariationArray(value: unknown): value is Array<{ name: string; moves: string[] }> {
  return Array.isArray(value) && value.every((item) => {
    return (
      typeof item === "object" &&
      item !== null &&
      typeof (item as any).name === "string" &&
      isStringArray((item as any).moves)
    );
  });
}

export function respondWithThemeResult(res: any, result: any) {
  if (result?.error) {
    return res.status(400).json({ success: false, error: result.error });
  }
  return res.json({ success: true, data: result?.data });
}
