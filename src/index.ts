import express from "express";
import cors from "cors";
import { MCPStockfish } from "./engine/MCPStockfish.js";
import { EnginePool } from "./engine/pool.js";
import { formatEvaluation, formatStockfishPositionEval } from "./engine/format.js";
import { checkFenInAllDatabases } from "./openingdatabase/ecoDatabase.js";
import { flipNullMoveFen } from "./engine/parseResults.js";
import { ExpandQueueService } from "./engine/expandQueue.js";
import { PositionEval } from "./engine/engine.js";
import { cacheGet, cacheSet, cacheGetBatch, cacheSetBatch } from "./engine/sfcache.js";
import { validateFen as vfen } from "chess.js";
import { ThemeAnalysisService } from "./themes/service.js";

const app = express();
app.use(cors());
app.use(express.json());

const enginePool = new EnginePool();
const expandQueueService = new ExpandQueueService();
const themeService = new ThemeAnalysisService();



const MAX_DEPTH = 30;
const MIN_DEPTH = 1;
const MAX_BATCH_SIZE = 25;
const MAX_MULTI_PV = 5;
const MIN_MULTI_PV = 1;

function clampDepth(depth: unknown, defaultDepth = 15): number {
  const d = Number(depth);
  if (isNaN(d) || !Number.isInteger(d)) return defaultDepth;
  return Math.min(Math.max(d, MIN_DEPTH), MAX_DEPTH);
}

function validateMultiPv(multiPv: unknown, defaultVal = 1): number {
  const v = Number(multiPv);
  if (isNaN(v) || !Number.isInteger(v)) return defaultVal;
  return Math.min(Math.max(v, MIN_MULTI_PV), MAX_MULTI_PV);
}


/**
 * Validates a FEN string using chess.js.
 * Returns an error message string on failure, or null if the FEN is valid.
 */
function validateFen(fen: unknown): string | null {
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isVariationArray(value: unknown): value is Array<{ name: string; moves: string[] }> {
  return Array.isArray(value) && value.every((item) => {
    return (
      typeof item === "object" &&
      item !== null &&
      typeof (item as any).name === "string" &&
      isStringArray((item as any).moves)
    );
  });
}

function respondWithThemeResult(res: any, result: any) {
  if (result?.error) {
    return res.status(400).json({ success: false, error: result.error });
  }
  return res.json({ success: true, data: result?.data });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
 
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    limits: { maxDepth: MAX_DEPTH, maxBatchSize: MAX_BATCH_SIZE, maxPv: MAX_MULTI_PV },
  });
});
 
 
app.post("/evaluate", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, nullMove = false } = req.body;
 
    const fenError = validateFen(fen);
    if (fenError) return res.status(400).json({ success: false, error: fenError });
 
    const depth = clampDepth(req.body.depth);
    const multiPv = validateMultiPv(req.body.multiPv);
 
    const cacheKey = { fen, depth, multiPv, nullMove: Boolean(nullMove) };
    const evalFen = flipNullMoveFen(fen, nullMove);
 
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: formatStockfishPositionEval(evalFen, cached, nullMove),
        cache: { hit: true },
      });
    }
 
    engine = await enginePool.getEngine();
    const result = await engine.evaluatePositionWithUpdate({ fen: evalFen, depth, multiPv });
 
    cacheSet(cacheKey, result, "evaluate").catch(() => {});
 
    return res.json({
      success: true,
      data: formatStockfishPositionEval(evalFen, result, nullMove),
      cache: { hit: false },
    });
  } catch (error) {
    console.error("Evaluation error:", error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    if (engine) enginePool.releaseEngine(engine);
  }
});
 
 
app.post("/positioneval", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, nullMove = false } = req.body;
 
    const fenError = validateFen(fen);
    if (fenError) return res.status(400).json({ success: false, error: fenError });
 
    const depth = clampDepth(req.body.depth);
    const multiPv = validateMultiPv(req.body.multiPv);
 
    const cacheKey = { fen, depth, multiPv, nullMove: Boolean(nullMove) };
    const evalFen = flipNullMoveFen(fen, nullMove);
 
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, cache: { hit: true } });
    }
 
    engine = await enginePool.getEngine();
    const result = await engine.evaluatePositionWithUpdate({ fen: evalFen, depth, multiPv });
 
    cacheSet(cacheKey, result, "positioneval").catch(() => {});
 
    return res.json({ success: true, data: result, cache: { hit: false } });
  } catch (error) {
    console.error("Evaluation error:", error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    if (engine) enginePool.releaseEngine(engine);
  }
});
 
 
app.post("/analyze-batch", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { positions } = req.body;
    if (!Array.isArray(positions)) {
      return res.status(400).json({ success: false, error: "positions must be an array." });
    }
    if (positions.length === 0) {
      return res.status(400).json({ success: false, error: "positions array must not be empty." });
    }
    if (positions.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        error: `Batch size exceeds limit. Maximum is ${MAX_BATCH_SIZE} positions, received ${positions.length}.`,
      });
    }
 
    // Validate every FEN up-front and return a clear error before touching the engine.
    const validationErrors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < positions.length; i++) {
      const err = validateFen(positions[i]?.fen);
      if (err) validationErrors.push({ index: i, error: err });
    }
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "One or more positions contain an invalid FEN.",
        validationErrors,
      });
    }
 
    const defaultDepth = clampDepth(req.body.depth);
 
    // Batch cache keys always use the original FEN + nullMove so the stored
    // result is never ambiguous (batch doesn't support nullMove currently, so
    // we default to false to keep the door open for future extension).
    const keys = positions.map((p) => ({
      fen: p.fen as string,
      depth: clampDepth(p.depth, defaultDepth),
      multiPv: validateMultiPv(p.multiPv),
      nullMove: false as const,
    }));
 
    const cacheResults = await cacheGetBatch(keys);
 
    const results: Array<{ fen: string; result: object; cache: { hit: boolean } }> = new Array(positions.length);
    const missIndices: number[] = [];
 
    for (let i = 0; i < cacheResults.length; i++) {
      const cr = cacheResults[i];
      if (cr.hit && cr.result) {
        results[i] = {
          fen: cr.fen,
          result: formatStockfishPositionEval(cr.fen, cr.result, false),
          cache: { hit: true },
        };
      } else {
        missIndices.push(i);
      }
    }
 
    if (missIndices.length > 0) {
      engine = await enginePool.getEngine();
      const newEntries: Array<{ key: typeof keys[number]; result: PositionEval }> = [];
 
      for (const idx of missIndices) {
        const { fen, depth: d, multiPv: pv } = keys[idx];
        const raw = await engine.evaluatePositionWithUpdate({ fen, depth: d, multiPv: pv });
        results[idx] = { fen, result: formatStockfishPositionEval(fen, raw, false), cache: { hit: false } };
        newEntries.push({ key: keys[idx], result: raw });
      }
 
      cacheSetBatch(newEntries, "batch").catch(() => {});
    }
 
    return res.json({
      success: true,
      results,
      cacheStats: {
        total: positions.length,
        hits: positions.length - missIndices.length,
        misses: missIndices.length,
      },
    });
  } catch (error) {
    console.error("Batch analysis error:", error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    if (engine) enginePool.releaseEngine(engine);
  }
});
 
 
app.post("/bestmove", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, nullMove = false } = req.body;
 
    const fenError = validateFen(fen);
    if (fenError) return res.status(400).json({ success: false, error: fenError });
 
    const depth = clampDepth(req.body.depth);
    const evalFen = flipNullMoveFen(fen, nullMove);
    engine = await enginePool.getEngine();
    const result = await engine.evaluatePositionWithUpdate({ fen: evalFen, depth, multiPv: 1 });
    const cleanedResult = formatStockfishPositionEval(evalFen, result, nullMove);
 
    return res.json({ success: true, bestMove: cleanedResult.bestmove, evaluation: formatEvaluation(result.lines[0]) });
  } catch (error) {
    console.error("Best move error:", error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    if (engine) enginePool.releaseEngine(engine);
  }
});

app.post("/themes/scores", (req, res) => {
  const { fen, color, is960 = false } = req.body;
  const result = themeService.getThemeScores(fen, color, Boolean(is960));
  return respondWithThemeResult(res, result);
});

app.post("/themes/tactical-summary", (req, res) => {
  const { fen, is960 = false } = req.body;
  const result = themeService.getTacticalPositionSummary(fen, Boolean(is960));
  return respondWithThemeResult(res, result);
});

app.post("/themes/variation-analysis", (req, res) => {
  const { rootFen, moves, color, is960 = false } = req.body;
  const rootFenError = validateFen(rootFen);
  if (rootFenError) return res.status(400).json({ success: false, error: rootFenError });
  if (!isStringArray(moves)) {
    return res.status(400).json({ success: false, error: "moves must be an array of SAN/uci strings." });
  }
  const result = themeService.analyzeVariationThemes(rootFen, moves, color, Boolean(is960));
  return respondWithThemeResult(res, result);
});

app.post("/themes/progression", (req, res) => {
  const { rootFen, moves, color, theme, is960 = false } = req.body;
  const rootFenError = validateFen(rootFen);
  if (rootFenError) return res.status(400).json({ success: false, error: rootFenError });
  if (!isStringArray(moves)) {
    return res.status(400).json({ success: false, error: "moves must be an array of SAN/uci strings." });
  }
  const result = themeService.getThemeProgression(rootFen, moves, color, theme, Boolean(is960));
  return respondWithThemeResult(res, result);
});

app.post("/themes/compare-variations", (req, res) => {
  const { rootFen, variations, color, is960 = false } = req.body;
  const rootFenError = validateFen(rootFen);
  if (rootFenError) return res.status(400).json({ success: false, error: rootFenError });
  if (!isVariationArray(variations)) {
    return res.status(400).json({ success: false, error: "variations must be an array of { name, moves } objects." });
  }
  const result = themeService.compareVariations(rootFen, variations, color, Boolean(is960));
  return respondWithThemeResult(res, result);
});

app.post("/themes/critical-moments", (req, res) => {
  const { rootFen, moves, color, threshold = 0.5, is960 = false } = req.body;
  const rootFenError = validateFen(rootFen);
  if (rootFenError) return res.status(400).json({ success: false, error: rootFenError });
  if (!isStringArray(moves)) {
    return res.status(400).json({ success: false, error: "moves must be an array of SAN/uci strings." });
  }
  const parsedThreshold = Number(threshold);
  const result = themeService.findCriticalMoments(rootFen, moves, color, isNaN(parsedThreshold) ? 0.5 : parsedThreshold, Boolean(is960));
  return respondWithThemeResult(res, result);
});

app.post("/themes/game-review", (req, res) => {
  const { pgn, criticalMomentThreshold = 0.5, format = "text", is960 = false } = req.body;
  const reviewFormat = format === "json" ? "json" : "text";
  const parsedThreshold = Number(criticalMomentThreshold);
  const result = themeService.generateGameReview(
    pgn,
    isNaN(parsedThreshold) ? 0.5 : parsedThreshold,
    reviewFormat,
    Boolean(is960),
  );
  return respondWithThemeResult(res, result);
});

app.post("/book", async (req, res) => {
  try {
    const { fen } = req.body;
 
    const fenError = validateFen(fen);
    if (fenError) return res.status(400).json({ success: false, error: fenError });
 
    return res.json({ success: true, book: checkFenInAllDatabases(fen) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});
 
 
app.post("/expandqueue", async (req, res) => {
  try {
    const { fen, expansionDepth, expansionWidth, maxPositionsQueued } = req.body;
 
    const fenError = validateFen(fen);
    if (fenError) return res.status(400).json({ success: false, error: fenError });
 
    const toPositiveInt = (v: unknown, label: string, max: number) => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (isNaN(n) || n < 1 || !Number.isInteger(n)) throw new Error(`${label} must be a positive integer (max ${max})`);
      return n;
    };
 
    const result = await expandQueueService.expand({
      fen,
      expansionDepth: toPositiveInt(expansionDepth, "expansionDepth", 10),
      expansionWidth: toPositiveInt(expansionWidth, "expansionWidth", 5),
      maxPositionsQueued: toPositiveInt(maxPositionsQueued, "maxPositionsQueued", 20),
    });
 
    return res.json({
      success: result.success,
      positionsVisited: result.positionsVisited,
      positionsQueued: result.positionsQueued,
      cappedByLimit: result.cappedByLimit,
      queuedFens: result.queuedFens,
      ...(result.errors.length > 0 && { errors: result.errors }),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(msg.includes("must be") ? 400 : 500).json({ success: false, error: msg });
  }
});
 
app.get("/expandqueue/stream", async (req, res) => {
  try {
    const { fen, expansionDepth, expansionWidth, maxPositionsQueued } = req.query;
 
    const fenError = validateFen(fen);
    if (fenError) return res.status(400).json({ success: false, error: fenError });
 
    const toPositiveInt = (v: unknown, label: string, max: number) => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (isNaN(n) || n < 1 || !Number.isInteger(n)) throw new Error(`${label} must be a positive integer (max ${max})`);
      return n;
    };
 
    req.on("close", () => res.end());
    await expandQueueService.expandStream(
      {
        fen: fen as string,
        expansionDepth: toPositiveInt(expansionDepth, "expansionDepth", 10),
        expansionWidth: toPositiveInt(expansionWidth, "expansionWidth", 5),
        maxPositionsQueued: toPositiveInt(maxPositionsQueued, "maxPositionsQueued", 20),
      },
      res
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    if (!res.headersSent) {
      res.status(400).json({ success: false, error: msg });
    } else {
      res.write(`data: ${JSON.stringify({ event: "error", message: msg })}\n\n`);
      res.end();
    }
  }
});
 
 
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => console.log(`Stockfish API running on port ${PORT}`));