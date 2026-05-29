import { Color } from "chess.js";
import { getBoardState } from "./state.js";
import { BoardState, SideStateScores, STATE_THEMES } from "../types.js";
import { TacticalBoard } from "../themes/tacticalBoard.js";
import { TempoCalculator } from "../themes/temoCalculator.js";

export class PositionScorer {
  private state: BoardState;
  private tacticalScorer: TacticalBoard;
  private tempoScorer: TempoCalculator;
  private side: Color;


  constructor(fen: string, color: Color, is960: boolean) {
    this.state = getBoardState(fen, is960);
    this.tacticalScorer = new TacticalBoard(fen, is960);
    this.side = color;
    this.tempoScorer = new TempoCalculator(this.state, this.tacticalScorer, this.side);
    
  }

  private get getSideScorer(): SideStateScores {
    return this.side == "w" ? this.state.white : this.state.black;
  }

  public getThemeScore(theme: STATE_THEMES): number {
    if(this.side === "w") return this.getSideThemeScore(theme);

    return - (this.getSideThemeScore(theme))
  }

  private getSideThemeScore(theme: STATE_THEMES): number {
    const currentSideState: SideStateScores = this.getSideScorer;
    switch (theme) {
      case STATE_THEMES.KING_SAFETY:
        return currentSideState.kingSafetyScore.kingsafetysadvantage;
      case STATE_THEMES.MATERIAL:
        return currentSideState.materialScore.materialadvantage;
      case STATE_THEMES.MOBILITY:
        return currentSideState.pieceMobilityScore.mobilityadvantage;
      case STATE_THEMES.POSITIONAL:
        return currentSideState.positionalScore.positionalAdvatange;
      case STATE_THEMES.SPACE:
        return currentSideState.spaceScore.spaceadvantage;
      case STATE_THEMES.TACTICAL:
        return this.tacticalScorer.calculateTacticalScore(this.side);
      case STATE_THEMES.SQAURE_CONTROL_LIGHT:
        return currentSideState.squareControlScore.lightSquareAdvantage;
      case STATE_THEMES.SQAURE_CONTROL_DARK:
        return currentSideState.squareControlScore.darkSqaureAdvantage;
      case STATE_THEMES.TEMPO:
        return this.tempoScorer.getTempoAdvantage();      
    }

    return 0;
  }
}
