import { Express } from "express";
import { ExpandQueueService } from "../engine/expandQueue.js";
import { checkFenInAllDatabases } from "../openingdatabase/ecoDatabase.js";
import { validateFen } from "./utils.js";

export function registerBookAndExpansionRoutes(app: Express, expandQueueService: ExpandQueueService) {
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
}
