import ecoData from './eco_interpolated.json' with { type: "json" };
import ecoDataA from './ecoA.json' with { type: "json" };
import ecoDataB from './ecoB.json' with { type: "json" };
import ecoDataC from './ecoC.json' with { type: "json" };
import ecoDataD from './ecoD.json' with { type: "json" };
import ecoDataE from './ecoE.json' with { type: "json" };
/**
 * Check if a given FEN exists in the ECO database
 * @param fen - The FEN string to check
 * @param ecoDatabase - The ECO database object (defaults to imported data)
 * @returns The ECO entry if found, null if not found
 */
export function checkFenInEco(fen, ecoDatabase) {
    return ecoDatabase[fen] || null;
}
export function checkFenInAllDatabases(fen) {
    const databases = [ecoDataA, ecoDataB, ecoDataC, ecoDataD, ecoDataE, ecoData];
    for (const db of databases) {
        const entry = checkFenInEco(fen, db);
        if (entry) {
            return entry;
        }
    }
    return null;
}
/**
 * Check if a FEN exists and return boolean
 * @param fen - The FEN string to check
 * @param ecoDatabase - The ECO database object (defaults to imported data)
 * @returns true if FEN exists, false otherwise
 */
export function fenExists(fen, ecoDatabase) {
    return fen in ecoDatabase;
}
export function isFenInAllDatabases(fen) {
    return fenExists(fen, ecoDataA) || fenExists(fen, ecoDataB) || fenExists(fen, ecoDataC) || fenExists(fen, ecoDataD) || fenExists(fen, ecoDataE) || fenExists(fen, ecoData);
}
