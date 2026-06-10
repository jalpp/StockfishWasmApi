import { Chess } from "chess.js";
import { Chess960, validateFen } from "void57-chess";


export function chessBuilder(is960: boolean) {
  let chess;

  is960 ? (chess = new Chess960()) : (chess = new Chess());

  return chess;
}


export function chessFromFenBuilder(rootFen: string, is960: boolean) {
   let chess;

  is960 ? (chess = new Chess960(rootFen)) : (chess = new Chess(rootFen));

  return chess;
}

export function validColorSchema(color: string): string {
  if (color === "white") return "w";
  if (color === "black") return "b";
  if (color === "w") return color;
  if (color === "b") return color;

  return "w";
}

export function validate960Fen(fen: string): boolean {
  return validateFen(fen).ok;
}

export function validateStandardFen(fen: string): boolean {
  return validateFen(fen).ok;
}

export function validationBuilder(is960: boolean, fen: string) {
  let validFen;

  is960 ? (validFen = validate960Fen(fen)) : (validFen = validateStandardFen(fen));

  return validFen;
}

export function chessValidateBuilder(is960: boolean, fen: string) {
  return {
    chess: chessFromFenBuilder(fen, is960),
    isValid: validationBuilder(is960, fen),
  };
}

export function parseMovesForEndingState(rootFen: string, moves: string[], is960: boolean) {
  const chess = chessFromFenBuilder(rootFen, is960);

  for(let i = 0; i < moves.length; i++){
    chess.move(moves[i]);
  }

  return chess.fen();
}

