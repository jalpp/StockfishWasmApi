import { EngineWorker, EngineName, UciEngine } from "@jalpp/stockfishts";
import { StockfishProcess } from "./stockfishprocess.js";

async function createStockfishEngineWorker(): Promise<EngineWorker> {
    const proc = new StockfishProcess();

    const engineWorker: EngineWorker = {
        uci(command: string) {
            proc.send(command);
        },
        listen(data: string) {
            
        },
        onError(msg: any) {
            
        },
        terminate() {
            proc.quit();
        },
    };

    proc.onMessage((line) => {
        engineWorker.listen(line);
    });

    return engineWorker;
}

export class MCPStockfish extends UciEngine {
    private constructor(worker: EngineWorker) {
        super(EngineName.Stockfish17Point, worker);
    }

    static async create(): Promise<MCPStockfish> {
        const worker = await createStockfishEngineWorker();
        return new MCPStockfish(worker);
    }

    async init() {
        await super.init();
        await this.sendCommands(["uci", "isready"], "uciok");
    }
}
