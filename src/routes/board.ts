import { Express } from "express";
import { BoardStateService } from "../themes/boardService.js";
import { validateFen, respondWithThemeResult } from "./utils.js";

export function registerBoardRoutes(app: Express, boardService: BoardStateService) {
  const prefix = "/board";

  app.post(`${prefix}/check-legal-move`, (req, res) => {
    const { fen, move, is960 = false } = req.body;

    const fenError = validateFen(fen);
    if (fenError) {
      return res.status(400).json({ success: false, error: fenError });
    }

    const result = boardService.checkLegalMove(fen, move, Boolean(is960));
    return respondWithThemeResult(res, result);
  });

  app.post(`${prefix}/state-for-move`, (req, res) => {
    const { fen, move, is960 = false } = req.body;

    const fenError = validateFen(fen);
    if (fenError) {
      return res.status(400).json({ success: false, error: fenError });
    }

    const result = boardService.getBoardStateForMove(fen, move, Boolean(is960));
    return respondWithThemeResult(res, result);
  });

  app.post(`${prefix}/state-for-fen`, (req, res) => {
    const { fen, is960 = false } = req.body;

    const fenError = validateFen(fen);
    if (fenError) {
      return res.status(400).json({ success: false, error: fenError });
    }

    const result = boardService.getBoardStateForFen(fen, Boolean(is960));
    return respondWithThemeResult(res, result);
  });

  app.post(`${prefix}/ending-state`, (req, res) => {
    const { fen, moves, is960 = false } = req.body;

    const fenError = validateFen(fen);
    if (fenError) {
      return res.status(400).json({ success: false, error: fenError });
    }

    if (!Array.isArray(moves) || !moves.every((move) => typeof move === "string")) {
      return res.status(400).json({ success: false, error: "moves must be an array of strings." });
    }

    const result = boardService.getEndingBoardStateForMoves(fen, moves, Boolean(is960));
    return respondWithThemeResult(res, result);
  });
}
