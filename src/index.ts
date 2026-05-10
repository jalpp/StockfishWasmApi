import express from "express";
import cors from "cors";
import { MCPStockfish } from "./engine/MCPStockfish.js";
import { EnginePool } from "./engine/pool.js";
import { formatEvaluation, formatStockfishPositionEval } from "./engine/format.js";
import { checkFenInAllDatabases } from "./openingdatabase/ecoDatabase.js";
import { flipNullMoveFen } from "./engine/parseResults.js";
import { ExpandQueueService } from "./engine/expandQueue.js";

const app = express();

app.use(cors());
app.use(express.json());

const enginePool = new EnginePool();


const expandQueueService = new ExpandQueueService();

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Evaluate position endpoint
app.post("/evaluate", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, depth = 15, multiPv = 1, nullMove = false } = req.body;

    if (!fen) {
      return res.status(400).json({ error: "FEN is required" });
    }

    let evalFen = flipNullMoveFen(fen, nullMove);
    engine = await enginePool.getEngine();

    const result = await engine.evaluatePositionWithUpdate({
      fen: evalFen,
      depth,
      multiPv,
    });

    const cleanedResult = formatStockfishPositionEval(evalFen, result, nullMove);

    res.json({
      success: true,
      data: cleanedResult,
    });
  } catch (error) {
    console.error("Evaluation error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    if (engine) {
      enginePool.releaseEngine(engine);
    }
  }
});

app.get('/expandqueue/stream', async (req, res) => {
  try {
    const { fen, expansionDepth, expansionWidth, maxPositionsQueued } = req.query;
 
    if (!fen || typeof fen !== 'string') {
      return res.status(400).json({ error: 'fen query param is required' });
    }
 
    const toPositiveInt = (v: unknown, label: string, max: number) => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (isNaN(n) || n < 1 || !Number.isInteger(n)) {
        throw new Error(`${label} must be a positive integer (max ${max})`);
      }
      return n;
    };
 
    const depthNum  = toPositiveInt(expansionDepth,     'expansionDepth',     10);
    const widthNum  = toPositiveInt(expansionWidth,     'expansionWidth',      5);
    const maxQueued = toPositiveInt(maxPositionsQueued, 'maxPositionsQueued', 20);
 
    // Cleanly end the stream if the client disconnects mid-run
    req.on('close', () => res.end());
 
    await expandQueueService.expandStream(
      { fen, expansionDepth: depthNum, expansionWidth: widthNum, maxPositionsQueued: maxQueued },
      res,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    // If headers not sent yet we can still send a normal error response
    if (!res.headersSent) {
      res.status(400).json({ success: false, error: msg });
    } else {
      // Headers already flushed (SSE open) — send as an error event then close
      res.write(`data: ${JSON.stringify({ event: 'error', message: msg })}\n\n`);
      res.end();
    }
  }
});

// raw position eval for given position
app.post("/positioneval", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, depth = 15, multiPv = 1, nullMove = false } = req.body;

    if (!fen) {
      return res.status(400).json({ error: "FEN is required" });
    }

    engine = await enginePool.getEngine();

    let evalFen = flipNullMoveFen(fen, nullMove);

    const result = await engine.evaluatePositionWithUpdate({
      fen: evalFen,
      depth,
      multiPv,
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Evaluation error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    if (engine) {
      enginePool.releaseEngine(engine);
    }
  }
});

app.post("/book", async (req, res) => {
  try {
    const { fen} = req.body;

    if (!fen) {
      return res.status(400).json({ error: "FEN is required" });
    }

    const book = checkFenInAllDatabases(fen);
    res.json({
      success: true,
      book: book
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } 
});


// Best move endpoint
app.post("/bestmove", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { fen, depth = 15, nullMove = false } = req.body;

    if (!fen) {
      return res.status(400).json({ error: "FEN is required" });
    }

    let evalFen = flipNullMoveFen(fen, nullMove);
    engine = await enginePool.getEngine();

    const result = await engine.evaluatePositionWithUpdate({
      fen: evalFen,
      depth,
      multiPv: 1,
    });

    const cleanedResult = formatStockfishPositionEval(evalFen, result, nullMove);

    res.json({
      success: true,
      bestMove: cleanedResult.bestmove,
      evaluation: formatEvaluation(result.lines[0])
    });
  } catch (error) {
    console.error("Best move error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    if (engine) {
      enginePool.releaseEngine(engine);
    }
  }
});

// Analyze multiple positions (batch)
app.post("/analyze-batch", async (req, res) => {
  let engine: MCPStockfish | null = null;
  try {
    const { positions, depth = 15 } = req.body;

    if (!Array.isArray(positions)) {
      return res.status(400).json({ error: "Positions array is required" });
    }

    engine = await enginePool.getEngine();
    const results = [];

    for (const pos of positions) {
      const result = await engine.evaluatePositionWithUpdate({
        fen: pos.fen,
        depth: pos.depth || depth,
        multiPv: pos.multiPv || 1,
      });
      const cleanedResult = formatStockfishPositionEval(pos.fen, result, undefined);
      results.push({
        fen: pos.fen,
        result: cleanedResult,
      });
    }

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Batch analysis error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    if (engine) {
      enginePool.releaseEngine(engine);
    }
  }
});

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.log(`Stockfish Server Server running on port ${PORT}`);
});

