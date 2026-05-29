"use server";
import { BLACK, QUEEN, KING, validateFen, WHITE, Chess } from "chess.js";
import { BoardState, SideStateScores } from "../types.js";
import { getGamePhase } from "../themes/gamePhase.js";
import { getMaterialInfo } from "../themes/material.js";
import { getSidePositionalCount } from "../themes/positional.js";
import { getSideAttackerDefenderInfo } from "../themes/attackerDefender.js";
import { getPiecePlacement } from "../themes/piecePlacement.js";
import { getSideSpaceControl } from "../themes/spaceControl.js";
import { getSideSquareControl } from "../themes/sqaureControl.js";
import { getKingSafety } from "../themes/kingSafety.js";
import { getPieceMobility } from "../themes/pieceMobility.js";
import { chessValidateBuilder } from "../themes/utils/index.js";


export function calculateDeep(
  fen: string,
  move: string,
  is960: boolean
): BoardState | undefined {
  const {chess} = chessValidateBuilder(is960, fen);
  chess.move(move);
  return getBoardState(chess.fen(), is960);
}

export function getBoardState(fen: string, is960: boolean): BoardState {
  
  const {isValid, chess} = chessValidateBuilder(is960, fen);

  if(!isValid){
    return {} as BoardState;
  }

  const whitecastlerights = {
    queenside: chess.getCastlingRights(WHITE)[QUEEN],
    kingside: chess.getCastlingRights(WHITE)[KING],
  };

  const blackcastlerights = {
    queenside: chess.getCastlingRights(BLACK)[QUEEN],
    kingside: chess.getCastlingRights(BLACK)[KING],
  };

  const legalMoves = chess.moves();
  const isCheckmate = chess.isCheckmate();
  const isStalemate = chess.isStalemate();
  const isGameOver = chess.isGameOver();
  const moveNumber = chess.moveNumber();
  const sidetomove = chess.turn() === "w" ? "white" : "black";
  const gamePhase = getGamePhase(chess);

  const whiteScores: SideStateScores = {
    castlingScore: whitecastlerights,
    materialScore: getMaterialInfo(chess, WHITE),
    spaceScore: getSideSpaceControl(chess, WHITE),
    pieceplacementScore: getPiecePlacement(chess, WHITE),
    positionalScore: getSidePositionalCount(chess, WHITE),
    squareControlScore: getSideSquareControl(chess, WHITE),
    kingSafetyScore: getKingSafety(chess, WHITE),
    pieceMobilityScore: getPieceMobility(fen, WHITE),
  };

  const blackScores: SideStateScores = {
    castlingScore: blackcastlerights,
    materialScore: getMaterialInfo(chess, BLACK),
    spaceScore: getSideSpaceControl(chess, BLACK),
    pieceplacementScore: getPiecePlacement(chess, BLACK),
    positionalScore: getSidePositionalCount(chess, BLACK),
    squareControlScore: getSideSquareControl(chess, BLACK),
    kingSafetyScore: getKingSafety(chess, BLACK),
    pieceMobilityScore: getPieceMobility(fen, BLACK),
  };

  return {
    fen,
    validfen: isValid,
    legalMoves,
    white: whiteScores,
    black: blackScores,
    whitepieceattackerdefenderinfo: getSideAttackerDefenderInfo(chess, WHITE),
    blackpieceattackerdefenderinfo: getSideAttackerDefenderInfo(chess, BLACK),
    isCheckmate,
    isStalemate,
    isGameOver,
    moveNumber,
    sidetomove,
    gamePhase,
    is960,
  };
}
