import { Express } from "express";
import { EnginePool } from "../engine/pool.js";
import { ExpandQueueService } from "../engine/expandQueue.js";
import { ThemeAnalysisService } from "../themes/service.js";
import { BoardStateService } from "../themes/boardService.js";

import { registerHealthRoutes } from "./health.js";
import { registerEngineRoutes } from "./engine.js";
import { registerThemeRoutes } from "./themes.js";
import { registerBoardRoutes } from "./board.js";
import { registerBookAndExpansionRoutes } from "./bookAndExpansion.js";
import { ChessUtilsService } from "../utils/utilService.js";
import { registerUtilsRoutes } from "./utilRouter.js";
import { registerPuzzleRoutes } from "./puzzleRouter.js";

/**
 * Main route orchestrator that registers all route categories.
 * This centralizes route setup while keeping each category in its own file.
 */
export function registerRoutes(
  app: Express,
  enginePool: EnginePool,
  expandQueueService: ExpandQueueService,
  themeService: ThemeAnalysisService,
  boardService: BoardStateService,
  utilService: ChessUtilsService,
) {
  registerHealthRoutes(app);
  registerBoardRoutes(app, boardService);
  registerEngineRoutes(app, enginePool);
  registerThemeRoutes(app, themeService);
  registerBookAndExpansionRoutes(app, expandQueueService);
  registerUtilsRoutes(app, utilService);
  registerPuzzleRoutes(app);
}
