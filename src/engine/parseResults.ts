
export function flipNullMoveFen(fen: string, nullMove: boolean): string {
    let evalFen = fen;
    if (nullMove) {
      const parts = fen.split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      evalFen = parts.join(' ');
    }

    return evalFen;
}