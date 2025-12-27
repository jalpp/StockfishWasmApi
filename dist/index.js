import express from "express";
import cors from "cors";
import { EnginePool } from "./engine/pool.js";
import { formatEvaluation, formatStockfishPositionEval } from "./engine/format.js";
import { checkFenInAllDatabases } from "./openingdatabase/ecoDatabase.js";
const app = express();
app.use(cors());
app.use(express.json());
const enginePool = new EnginePool();
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Evaluate position endpoint
app.post("/evaluate", async (req, res) => {
    let engine = null;
    try {
        const { fen, depth = 15, multiPv = 1 } = req.body;
        if (!fen) {
            return res.status(400).json({ error: "FEN is required" });
        }
        engine = await enginePool.getEngine();
        const result = await engine.evaluatePositionWithUpdate({
            fen,
            depth,
            multiPv,
        });
        const cleanedResult = formatStockfishPositionEval(fen, result);
        res.json({
            success: true,
            data: cleanedResult,
        });
    }
    catch (error) {
        console.error("Evaluation error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
    finally {
        if (engine) {
            enginePool.releaseEngine(engine);
        }
    }
});
app.post("/book", async (req, res) => {
    try {
        const { fen } = req.body;
        if (!fen) {
            return res.status(400).json({ error: "FEN is required" });
        }
        const book = checkFenInAllDatabases(fen);
        res.json({
            success: true,
            book: book
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
// Best move endpoint
app.post("/bestmove", async (req, res) => {
    let engine = null;
    try {
        const { fen, depth = 15 } = req.body;
        if (!fen) {
            return res.status(400).json({ error: "FEN is required" });
        }
        engine = await enginePool.getEngine();
        const result = await engine.evaluatePositionWithUpdate({
            fen,
            depth,
            multiPv: 1,
        });
        const cleanedResult = formatStockfishPositionEval(fen, result);
        res.json({
            success: true,
            bestMove: cleanedResult.bestmove,
            evaluation: formatEvaluation(result.lines[0])
        });
    }
    catch (error) {
        console.error("Best move error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
    finally {
        if (engine) {
            enginePool.releaseEngine(engine);
        }
    }
});
// Analyze multiple positions (batch)
app.post("/analyze-batch", async (req, res) => {
    let engine = null;
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
            const cleanedResult = formatStockfishPositionEval(pos.fen, result);
            results.push({
                fen: pos.fen,
                result: cleanedResult,
            });
        }
        res.json({
            success: true,
            results,
        });
    }
    catch (error) {
        console.error("Batch analysis error:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
    finally {
        if (engine) {
            enginePool.releaseEngine(engine);
        }
    }
});
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
    console.log(`Stockfish Server Server running on port ${PORT}`);
});
