import { Express } from "express";
import { sendPuzzleBuilder, PuzzleQuery } from "../puzzle/puzzleService.js";

export function registerPuzzleRoutes(app: Express) {
    const prefix = "/puzzle";

    // POST endpoint to get a puzzle based on query parameters
    app.post(`${prefix}/builder`, async (req, res) => {
        try {
            const puzzleQuery: PuzzleQuery = req.body;

            // Validate and parse query parameters
            if (puzzleQuery.ratingFrom !== undefined) {
                puzzleQuery.ratingFrom = Number(puzzleQuery.ratingFrom);
            }
            if (puzzleQuery.ratingTo !== undefined) {
                puzzleQuery.ratingTo = Number(puzzleQuery.ratingTo);
            }
            if (puzzleQuery.themes && typeof puzzleQuery.themes === "string") {
                puzzleQuery.themes = (puzzleQuery.themes as string).split(",").map(t => t.trim());
            }

            const result = await sendPuzzleBuilder(puzzleQuery);

            if (result.data && typeof result.data === "string" && result.data.includes("Failed")) {
                return res.status(400).json({ error: result.data });
            }

            res.json(result);
        } catch (error) {
            console.error("Error in puzzle builder:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });
}
