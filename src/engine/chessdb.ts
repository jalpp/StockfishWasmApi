import { Chess, Color } from "chess.js";

export function getChessDbNoteWord(note: string): string {
  switch (note) {
    case "!":
      return "Best";
    case "*":
      return "Good";
    case "?":
      return "Bad";
    default:
      return "unknown";
  }
}

export function normalizeChessDBScore(score: number, turn: Color): number {
  if (turn === "b") {
    return -score;
  }

  return score;
}


interface ChessDbMove {
  uci: string;
  san: string;
  score: string;
  winrate: string;
  rank: number;
  note: string;
}

interface ChessDbPv {
  score: number;
  depth: number;
  pv: string[];
  pvSAN: string[];
}

interface ChessDbResponse {
  status: string;
  moves: any[];
}

interface ChessDbPvResponse {
  status: string;
  score: number;
  depth: number;
  pv: string[];
  pvSAN: string[];
}

export class ChessDBService {
  private baseUrl: string;

  constructor(baseUrl: string = "https://www.chessdb.cn/cdb.php") {
    this.baseUrl = baseUrl;
  }

  async getAnalysis(fen: string): Promise<{ data?: { moves: ChessDbMove[]; totalMoves: number }; error?: string }> {
    if (!fen) {
      return { error: "Missing required argument: fen" };
    }

    const encodedFen = encodeURIComponent(fen);
    const apiUrl = `${this.baseUrl}?action=queryall&board=${encodedFen}&json=1`;

    try {
      const response = await fetch(apiUrl);

      if (!response.ok) {
        return { error: `HTTP ${response.status}: Failed to fetch ChessDB data` };
      }

      const responseData = (await response.json()) as ChessDbResponse;

      if (responseData.status !== "ok") {
        return { error: `Position evaluation not available: ${responseData.status}` };
      }

      const moves = responseData.moves;

      if (!Array.isArray(moves) || moves.length === 0) {
        return { error: "No candidate moves found for this position." };
      }

      const processedMoves = this.processMoves(moves, fen);

      return {
        data: {
          moves: processedMoves,
          totalMoves: processedMoves.length,
        },
      };
    } catch (error) {
      return { error: `Request failed: ${error}` };
    }
  }

  async getPv(fen: string): Promise<{ data?: ChessDbPv; error?: string }> {
    if (!fen) {
      return { error: "Missing required argument: fen" };
    }

    const encodedFen = encodeURIComponent(fen);
    const pvUrl = `${this.baseUrl}?action=querypv&board=${encodedFen}&stable=1&json=1`;

    try {
      const response = await fetch(pvUrl);

      if (!response.ok) {
        return { error: `HTTP ${response.status}: Failed to fetch PV` };
      }

      const responseData = (await response.json()) as ChessDbPvResponse;

      if (responseData.status !== "ok") {
        return { error: `PV not available: ${responseData.status}` };
      }

      const pvData: ChessDbPv = {
        score: responseData.score,
        depth: responseData.depth,
        pv: responseData.pv ?? [],
        pvSAN: responseData.pvSAN ?? [],
      };

      return { data: pvData };
    } catch (error) {
      return { error: `Request failed: ${error}` };
    }
  }

  async queueAnalysis(fen: string): Promise<{ success?: boolean; error?: string }> {
    if (!fen) {
      return { error: "Missing required argument: fen" };
    }

    const encodedFen = encodeURIComponent(fen);
    const queueUrl = `${this.baseUrl}?action=queue&board=${encodedFen}&json=1`;

    try {
      const response = await fetch(queueUrl);

      if (!response.ok) {
        return { error: `HTTP ${response.status}: Failed to queue analysis` };
      }

      const responseData = (await response.json()) as { status: string };

      if (responseData.status !== "ok") {
        return { error: `Failed to queue position: ${responseData.status}` };
      }

      return { success: true };
    } catch (error) {
      return { error: `Request failed: ${error}` };
    }
  }

  private processMoves(moves: any[], fen: string): ChessDbMove[] {
    const turn = new Chess(fen).turn();

    return moves.map((move: any) => {
      const scoreNum = Number(move.score);
      const fixedNote = getChessDbNoteWord(move.note?.split(" ")[0] || "");
      const normalizedScore = normalizeChessDBScore(scoreNum, turn);
      const scoreStr = isNaN(normalizedScore) ? "N/A" : (normalizedScore / 100).toFixed(2);

      return {
        uci: move.uci || "N/A",
        san: move.san || "N/A",
        score: scoreStr,
        winrate: move.winrate || "N/A",
        rank: move.rank,
        note: fixedNote,
      };
    });
  }
}