import { PUZZLE_THEMES } from "../utils/helpers.js";

export interface PuzzleData {
  lichessId: string;
  previousFEN: string;
  FEN: string;
  moves: string;
  preMove: string;
  rating: number;
  themes: string[];
  gameURL: string;
}

export interface PuzzleQuery {
  themes?: string[];
  ratingFrom?: number;
  ratingTo?: number;
}

export interface PuzzleTheme {
  tag: string;
  description: string;
}

export async function fetchPuzzle(
  query?: PuzzleQuery,
): Promise<PuzzleData | null> {
  try {
    let url = `https://api.chessgubbins.com/puzzles/random`;
    const params = new URLSearchParams();

    if (query?.themes && query.themes.length > 0) {
      params.append("themes", query.themes.join(","));
    }

    if (query?.ratingFrom && query?.ratingTo) {
      params.append("ratingFrom", query.ratingFrom.toString());
      params.append("ratingTo", query.ratingTo.toString());
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to fetch puzzle: HTTP ${response.status}`);
      return null;
    }

    const data: PuzzleData = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching puzzle:", error);
    return null;
  }
}

export function getDifficultyLevel(rating: number): string {
  if (rating < 1000) return "Beginner";
  if (rating < 1500) return "Intermediate";
  if (rating < 2000) return "Advanced";
  if (rating < 2500) return "Expert";
  return "Master";
}

export function formatSolution(moves: string): string {
  const moveList = moves.split(" ");
  return moveList.join(", ");
}

export function getThemeDescriptions(themeTags: string[]): string[] {
  return themeTags.map((tag) => {
    const theme = PUZZLE_THEMES.find((t) => t.tag === tag);
    return theme ? theme.description : tag;
  });
}

export async function sendPuzzleBuilder(puzzleQuery: PuzzleQuery) {
  const puzzle = await fetchPuzzle(puzzleQuery);

  if (!puzzle) {
    return {
      data: "Failed to fetch puzzle. Please try again.",
    };
  }

  const solutionMoves = puzzle.moves.split(" ");
  const firstMove = puzzle.preMove;
  const turnToMove = puzzle.FEN.split(" ")[1] === "w" ? "White" : "Black";
  const themeDescriptions = getThemeDescriptions(puzzle.themes);
  const difficultyLevel = getDifficultyLevel(puzzle.rating);

  const instructions = `A puzzle session has been started. The opponent just played ${firstMove}. It's ${turnToMove} to move. Guide the user through finding the best move without immediately revealing the answer. If they need help, provide hints about the tactical theme (${themeDescriptions.join(", ")}). The first move of the solution is ${solutionMoves[0]}.
        DO not show the themes to the user right away, hide the themes information from the start of the session, ONLY SHOW the themes when requested by the user.`;

  return {
    lichessId: puzzle.lichessId,
    rating: puzzle.rating,
    difficulty: difficultyLevel,
    themes: puzzle.themes,
    themeDescriptions,
    gameURL: puzzle.gameURL,
    previousFEN: puzzle.previousFEN,
    currentFEN: puzzle.FEN,
    turnToMove,
    opponentLastMove: firstMove,
    solution: solutionMoves,
    firstSolutionMove: solutionMoves[0],
    totalMoves: solutionMoves.length,
    instructions,
  };
}
