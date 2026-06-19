import { Express } from "express";
import { MCPStockfish } from "../engine/MCPStockfish.js";
import { EnginePool } from "../engine/pool.js";
import { formatEvaluation, formatStockfishPositionEval } from "../engine/format.js";
import { flipNullMoveFen } from "../engine/parseResults.js";
import { PositionEval } from "../engine/engine.js";
import { cacheGet, cacheSet, cacheGetBatch, cacheSetBatch } from "../engine/sfcache.js";
import { clampDepth, validateMultiPv, validateFen, MAX_BATCH_SIZE } from "./utils.js";

export function registerEngineRoutes(app: Express, enginePool: EnginePool) {
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
}
