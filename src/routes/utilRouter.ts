import { ChessUtilsService } from "../utils/utilService.js";
import {Express} from "express";


export function registerUtilsRoutes(app: Express, chessUtilService: ChessUtilsService) {

    const prefix = "/util"

    // GET knowledge base
    app.post(`${prefix}/knowledge-base`, (req, res) => {
        try {
            const result = chessUtilService.getKnowledgeBase();
            if (result.error) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // GET starter prompts
    app.post(`${prefix}/starter-prompts`, (req, res) => {
        try {
            const result = chessUtilService.getStarterPrompts();
            if (result.error) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // GET puzzle themes
    app.post(`${prefix}/puzzle-themes`, (req, res) => {
        try {
            const result = chessUtilService.getPuzzleThemes();
            if (result.error) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // Parse PGN into FENs
    app.post(`${prefix}/parse-pgn-into-fens`, (req, res) => {
        try {
            const { pgn, is960 } = req.body;
            const result = chessUtilService.parsePgnIntoFens(pgn, is960 || false);
            if (result.error) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // Get FEN map lookup
    app.post(`${prefix}/fen-map-lookup`, (req, res) => {
        try {
            const { pgn, isAfter, is960 } = req.body;
            const result = chessUtilService.getFenMapLookup(pgn, isAfter, is960 || false);
            if (result.error) {
                return res.status(400).json(result);
            }
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: "Internal server error" });
        }
    });

}