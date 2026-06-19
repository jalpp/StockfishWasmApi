import { getKnowledgeBase as getChessKnowledgeBase } from "./knowledgeBase.js";
import { moveToFenMap, PROMPT_CATEGORIES, collectFensFromGame } from "./helpers.js";
import { PUZZLE_THEMES } from "./helpers.js";

export interface UtilsResult {
  data?: any;
  error?: string;
}

export class ChessUtilsService {
  
  getKnowledgeBase(): UtilsResult {
    try {
      return { data: getChessKnowledgeBase() };
    } catch (error) {
      return { error: "Error getting chess knowledge base" };
    }
  }

  getStarterPrompts(): UtilsResult {
    try {
      const categories = Object.entries(PROMPT_CATEGORIES).map(([key, value]) => ({
        id: key,
        name: value.name,
        promptCount: value.prompts.length
      }));

      return { data: categories };
    } catch (error) {
      return { error: "Error getting starter prompts" };
    }
  }

  getPuzzleThemes(): UtilsResult {
    try {
      const themes = PUZZLE_THEMES.map(theme => ({
        tag: theme.tag,
        description: theme.description,
      }));

      return {
        data: {
          totalThemes: themes.length,
          themes: themes,
          popularThemes: [
            "fork", "pin", "skewer", "discoveredAttack",
            "mateIn1", "mateIn2", "mateIn3",
            "hangingPiece", "sacrifice", "deflection"
          ],
          difficultyThemes: [
            "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5",
            "short", "long", "veryLong"
          ],
        }
      };
    } catch (error) {
      return { error: `Error getting puzzle themes: ${error}` };
    }
  }

  parsePgnIntoFens(pgn: string, is960: boolean): UtilsResult {
    if (!pgn) {
      return { error: "Missing required argument: pgn" };
    }

    try {
      const histories = collectFensFromGame(pgn, is960);

      return {
        data: {
          histories: histories
        }
      };
    } catch (error) {
      return { error: "Invalid PGN" };
    }
  }

  getFenMapLookup(pgn: string, isAfter: boolean, is960: boolean): UtilsResult {
    if (!pgn) {
      return { error: "Missing required argument: pgn" };
    }

    if (isAfter === undefined || isAfter === null) {
      return { error: "Missing required argument: isAfter" };
    }

    try {
      const fenMap = moveToFenMap(pgn, isAfter, is960);

      return {
        data: {
          fenMap: fenMap,
          moveCount: Object.keys(fenMap).length,
          mappingType: isAfter ? "after move" : "before move"
        }
      };
    } catch (error) {
      return { error: `Error generating move-to-FEN map: ${error}` };
    }
  }
}