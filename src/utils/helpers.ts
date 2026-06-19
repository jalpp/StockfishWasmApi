import { Chess } from "chess.js";
import { Chess960 } from "void57-chess";

export const PROMPT_CATEGORIES = {
  quickPosition: {
    name: "Quick Position Analysis",
    prompts: [
      "Analyze this position from White's perspective: {fen}. Give material, mobility, space, king safety, and a 1-2 move best plan.",
      "From Black's view in this FEN: {fen}. What are the top 3 candidate moves and why?",
      "Evaluate the following position for White and propose a concrete improvement in 3 moves: {fen}.",
    ],
  },
  themeScores: {
    name: "Theme-Focused Scores",
    prompts: [
      "Compute theme scores (material, mobility, space, positional, king safety) for this position: {fen}, color {color}.",
      "Track how material and king safety change over the next 5 moves in this variation: {fen}, moves: {moves}.",
      "For the move sequence {moves}, show the progression of the theme '{theme}' from {color}'s perspective.",
    ],
  },
  variationExploration: {
    name: "Variation Exploration",
    prompts: [
      "From this root position {fen}, compare two lines: Line A {lineA}, Line B {lineB}. Which line maintains better space and king safety for {color}?",
      "Evaluate three candidate continuations after this move: {fen} … {move}. Provide a side-by-side theme analysis.",
      "Analyze a set of 2-3 variations from this root position and summarize which has the strongest material balance and initiative.",
    ],
  },
  stockfishAnalysis: {
    name: "Stockfish Deep Dive",
    prompts: [
      "Provide a Stockfish-based best move and the rationale for this position: {fen}, depth {depth}.",
      "After {opening}, analyze the position with best move, key plans, and a short variation for both sides.",
      "Given this position: {fen}, show a candidate move, a main line, and an alternative line with evaluation at depth {depth}.",
    ],
  },
  criticalMoments: {
    name: "Critical Moments",
    prompts: [
      "Identify the critical moments in this sequence: {moves}. Highlight where the material or king safety theme shifts significantly.",
      "Find the first moment in this line where {color}'s king safety worsens and suggest improvements for {opponent}: {fen}, moves: {moves}.",
      "List any moves in this variation that flip the evaluation by more than 0.5 pawns in favor of {color}.",
    ],
  },
  learning: {
    name: "Learning & Training",
    prompts: [
      "Explain the key imbalances in this position and how to exploit them as {color}: {fen}.",
      "Create a 5-question drill from this position focusing on pawn structure and piece activity: {fen}.",
      "Provide a short, practical plan for {color} to convert a small material edge in this position: {fen}.",
    ],
  },
  opening: {
    name: "Opening Repertoire",
    prompts: [
      "From this opening position, what are common middlegame plans for {color}, and how do you adapt if {opponent} plays {reply}?",
      "Generate a mini-repertoire for {color} against {opening} based on this transposition: {fen} with {color} to move.",
      "Summarize typical themes for {color} in this structure and suggest how {opponent} should respond.",
    ],
  },
  visualization: {
    name: "Visualization",
    prompts: [
      "Render the board for this FEN and annotate the best move visually: {fen}, best move: {move}.",
      "Provide a move-by-move text walk-through of this variation with brief explanations for each ply: {fen}, moves: {moves}.",
    ],
  },
  puzzles: {
    name: "Puzzles & Practice",
    prompts: [
      "Generate a tactical puzzle from this position with {color} to move that requires a forcing line to advantage: {fen}.",
      "Provide a mate-in-{n} puzzle derived from this position: {fen}, {color} to move.",
      "Give me three training prompts: 'find the best plan', 'spot the tactical shot', 'improve piece activity' using this position: {fen}.",
    ],
  },
  custom: {
    name: "Custom Analysis",
    prompts: [
      "Explain the key priorities for {color} in a +/- balance equal position with this FEN: {fen}.",
      "Describe how to transition from this middlegame to an endgame favorable to {color}, given this structure: {fen}.",
      "If I want to practice endgames, give me a pared-down line from this position that leads to a rook ending.",
    ],
  },
};

export function chessBuilder(is960: boolean) {
  let chess;

  is960 ? (chess = new Chess960()) : (chess = new Chess());

  return chess;
}

export function collectFensFromGame(pgn: string, is960: boolean) {
  const chess = chessBuilder(is960);
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  return history.map((move, i) => ({
    fenAfter: move.after,
    fenBefore: move.before,
    moveSan: move.san,
    index: i + 1,
    ply: Math.ceil((i + 1) / 2),
  }));
}

export function moveToFenMap(
  pgn: string,
  isAfter: boolean,
  is960: boolean,
): Record<string, string> {
  const fenMap: Record<string, string> = {};

  const chess = chessBuilder(is960);

  chess.loadPgn(pgn);

  const history = chess.history({ verbose: true });

  for (let i = 0; i < history.length; i++) {
    if (isAfter) {
      fenMap[`${history[i].san}`] = history[i].after;
    }
    fenMap[`${history[i].san}`] = history[i].before;
  }

  return fenMap;
}


export interface PuzzleTheme {
  tag: string;
  description: string;
}


export const PUZZLE_THEMES: PuzzleTheme[] = [
  { tag: "advancedPawn", description: "Advanced Pawn" },
  { tag: "advantage", description: "Advantage" },
  { tag: "anastasiaMate", description: "Anastasia's Mate" },
  { tag: "arabianMate", description: "Arabian Mate" },
  { tag: "attackingF2F7", description: "Attacking f2/f7" },
  { tag: "attraction", description: "Attraction" },
  { tag: "backRankMate", description: "Back Rank Mate" },
  { tag: "bishopEndgame", description: "Bishop Endgame" },
  { tag: "bodenMate", description: "Boden Mate" },
  { tag: "capturingDefender", description: "Capturing Defender" },
  { tag: "castling", description: "Castling" },
  { tag: "clearance", description: "Clearance" },
  { tag: "crushing", description: "Crushing" },
  { tag: "defensiveMove", description: "Defensive Move" },
  { tag: "deflection", description: "Deflection" },
  { tag: "discoveredAttack", description: "Discovered Attack" },
  { tag: "doubleBishopMate", description: "Double Bishop Mate" },
  { tag: "doubleCheck", description: "Double Check" },
  { tag: "dovetailMate", description: "Dovetail Mate" },
  { tag: "endgame", description: "Endgame" },
  { tag: "enPassant", description: "En Passant" },
  { tag: "equality", description: "Equality" },
  { tag: "exposedKing", description: "Exposed King" },
  { tag: "fork", description: "Fork" },
  { tag: "hangingPiece", description: "Hanging Piece" },
  { tag: "hookMate", description: "Hook Mate" },
  { tag: "interference", description: "Interference" },
  { tag: "intermezzo", description: "Intermezzo" },
  { tag: "killBoxMate", description: "Kill Box Mate" },
  { tag: "kingsideAttack", description: "Kingside Attack" },
  { tag: "knightEndgame", description: "Knight Endgame" },
  { tag: "long", description: "Long" },
  { tag: "master", description: "Master" },
  { tag: "masterVsMaster", description: "Master vs Master" },
  { tag: "mate", description: "Mate" },
  { tag: "mateIn1", description: "Mate In 1" },
  { tag: "mateIn2", description: "Mate In 2" },
  { tag: "mateIn3", description: "Mate In 3" },
  { tag: "mateIn4", description: "Mate In 4" },
  { tag: "mateIn5", description: "Mate In 5" },
  { tag: "middlegame", description: "Middlegame" },
  { tag: "oneMove", description: "One Move" },
  { tag: "opening", description: "Opening" },
  { tag: "pawnEndgame", description: "Pawn Endgame" },
  { tag: "pin", description: "Pin" },
  { tag: "promotion", description: "Promotion" },
  { tag: "queenEndgame", description: "Queen Endgame" },
  { tag: "queenRookEndgame", description: "Queen Rook Endgame" },
  { tag: "queensideAttack", description: "Queenside Attack" },
  { tag: "quietMove", description: "Quiet Move" },
  { tag: "rookEndgame", description: "Rook Endgame" },
  { tag: "sacrifice", description: "Sacrifice" },
  { tag: "short", description: "Short" },
  { tag: "skewer", description: "Skewer" },
  { tag: "smotheredMate", description: "Smothered Mate" },
  { tag: "superGM", description: "Super GM" },
  { tag: "trappedPiece", description: "Trapped Piece" },
  { tag: "underPromotion", description: "Under Promotion" },
  { tag: "veryLong", description: "Very Long" },
  { tag: "vukovicMate", description: "Vukovic's Mate" },
  { tag: "xRayAttack", description: "X Ray Attack" },
  { tag: "zugzwang", description: "Zugzwang" },
];
