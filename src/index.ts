import express from "express";
import cors from "cors";
import { EnginePool } from "./engine/pool.js";
import { ExpandQueueService } from "./engine/expandQueue.js";
import { ThemeAnalysisService } from "./themes/service.js";
import { BoardStateService } from "./themes/boardService.js";
import { registerRoutes } from "./routes/index.js";
import { ChessUtilsService } from "./utils/utilService.js";


const app = express();
app.use(cors());
app.use(express.json());


const enginePool = new EnginePool();
const expandQueueService = new ExpandQueueService();
const themeService = new ThemeAnalysisService();
const boardService = new BoardStateService();
const utilService = new ChessUtilsService();

registerRoutes(app, enginePool, expandQueueService, themeService, boardService, utilService);


const PORT = process.env.PORT || 8081;
app.listen(PORT, () => console.log(`Stockfish API running on port ${PORT}`));