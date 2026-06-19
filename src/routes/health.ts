import { Express } from "express";
import { MAX_DEPTH, MAX_BATCH_SIZE, MAX_MULTI_PV } from "./utils.js";

export function registerHealthRoutes(app: Express) {
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      limits: { maxDepth: MAX_DEPTH, maxBatchSize: MAX_BATCH_SIZE, maxPv: MAX_MULTI_PV },
    });
  });
}
