import { Express } from "express";
import { ThemeAnalysisService } from "../themes/service.js";
import { validateFen, isStringArray, isVariationArray, respondWithThemeResult } from "./utils.js";

export function registerThemeRoutes(app: Express, themeService: ThemeAnalysisService) {
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
}
