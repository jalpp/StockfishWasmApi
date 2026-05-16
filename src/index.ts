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

const app = express();
app.use(cors());
app.use(express.json());

const enginePool = new EnginePool();
const expandQueueService = new ExpandQueueService();



const MAX_DEPTH = 30;
const MIN_DEPTH = 1;
const MAX_BATCH_SIZE = 25;


function clampDepth(depth: unknown, defaultDepth = 15): number {
  const d = Number(depth);
  if (isNaN(d) || !Number.isInteger(d)) return defaultDepth;
  return Math.min(Math.max(d, MIN_DEPTH), MAX_DEPTH);
}

function validateMultiPv(multiPv: unknown, defaultVal = 1): number {
  const v = Number(multiPv);
  if (isNaN(v) || !Number.isInteger(v) || v < 1) return defaultVal;
  return v;
}


app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    limits: { maxDepth: MAX_DEPTH, maxBatchSize: MAX_BATCH_SIZE },
  });
});

// ─── /evaluate ────────────────────────────────────────────────────────────────

app.post("/evaluate", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, nullMove = false } = req.body;
    if (!fen) return res.status(400).json({ error: "FEN is required" });

    const depth = clampDepth(req.body.depth);
    const multiPv = validateMultiPv(req.body.multiPv);
    const evalFen = flipNullMoveFen(fen, nullMove);
    const cacheKey = { fen: evalFen, depth, multiPv };

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

// ─── /positioneval ───────────────────────────────────────────────────────────

app.post("/positioneval", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, nullMove = false } = req.body;
    if (!fen) return res.status(400).json({ error: "FEN is required" });

    const depth = clampDepth(req.body.depth);
    const multiPv = validateMultiPv(req.body.multiPv);
    const evalFen = flipNullMoveFen(fen, nullMove);
    const cacheKey = { fen: evalFen, depth, multiPv };

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

// ─── /analyze-batch ──────────────────────────────────────────────────────────

app.post("/analyze-batch", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { positions } = req.body;
    if (!Array.isArray(positions)) {
      return res.status(400).json({ error: "Positions array is required" });
    }
    if (positions.length === 0) {
      return res.status(400).json({ error: "Positions array must not be empty" });
    }
    if (positions.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        error: `Batch size exceeds limit. Maximum is ${MAX_BATCH_SIZE} positions, received ${positions.length}.`,
      });
    }

    const defaultDepth = clampDepth(req.body.depth);

    const keys = positions.map((p) => ({
      fen: p.fen as string,
      depth: clampDepth(p.depth, defaultDepth),
      multiPv: validateMultiPv(p.multiPv),
    }));

    // Validate all FENs are present
    for (let i = 0; i < keys.length; i++) {
      if (!keys[i].fen) {
        return res.status(400).json({ error: `Position at index ${i} is missing a FEN` });
      }
    }

    const cacheResults = await cacheGetBatch(keys);

    const results: Array<{ fen: string; result: object; cache: { hit: boolean } }> = new Array(positions.length);
    const missIndices: number[] = [];

    for (let i = 0; i < cacheResults.length; i++) {
      const cr = cacheResults[i];
      if (cr.hit && cr.result) {
        results[i] = { fen: cr.fen, result: formatStockfishPositionEval(cr.fen, cr.result, undefined), cache: { hit: true } };
      } else {
        missIndices.push(i);
      }
    }

    if (missIndices.length > 0) {
      engine = await enginePool.getEngine();
      const newEntries: Array<{ key: { fen: string; depth: number; multiPv: number }; result: PositionEval }> = [];

      for (const idx of missIndices) {
        const { fen, depth: d, multiPv: pv } = keys[idx];
        const raw = await engine.evaluatePositionWithUpdate({ fen, depth: d, multiPv: pv });
        results[idx] = { fen, result: formatStockfishPositionEval(fen, raw, undefined), cache: { hit: false } };
        newEntries.push({ key: { fen, depth: d, multiPv: pv }, result: raw });
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

// ─── /bestmove ────────────────────────────────────────────────────────────────

app.post("/bestmove", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, nullMove = false } = req.body;
    if (!fen) return res.status(400).json({ error: "FEN is required" });

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

// ─── /book ───────────────────────────────────────────────────────────────────

app.post("/book", async (req, res) => {
  try {
    const { fen } = req.body;
    if (!fen) return res.status(400).json({ error: "FEN is required" });
    return res.json({ success: true, book: checkFenInAllDatabases(fen) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// ─── /expandqueue ────────────────────────────────────────────────────────────

app.post("/expandqueue", async (req, res) => {
  try {
    const { fen, expansionDepth, expansionWidth, maxPositionsQueued } = req.body;
    if (!fen) return res.status(400).json({ error: "FEN is required" });

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
    if (!fen || typeof fen !== "string") return res.status(400).json({ error: "fen query param is required" });

    const toPositiveInt = (v: unknown, label: string, max: number) => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (isNaN(n) || n < 1 || !Number.isInteger(n)) throw new Error(`${label} must be a positive integer (max ${max})`);
      return n;
    };

    req.on("close", () => res.end());
    await expandQueueService.expandStream({
      fen,
      expansionDepth: toPositiveInt(expansionDepth, "expansionDepth", 10),
      expansionWidth: toPositiveInt(expansionWidth, "expansionWidth", 5),
      maxPositionsQueued: toPositiveInt(maxPositionsQueued, "maxPositionsQueued", 20),
    }, res);
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

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => console.log(`Stockfish API running on port ${PORT}`));