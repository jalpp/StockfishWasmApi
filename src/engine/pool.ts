
import { MCPStockfish } from './MCPStockfish.js';


export class EnginePool {
    private engines: MCPStockfish[] = [];
    private busyEngines: Set<number> = new Set();
    private maxEngines = 10;
    private waitQueue: Array<(engine: MCPStockfish) => void> = [];

    constructor() {}

    async getEngine(): Promise<MCPStockfish> {
        // Try to find an idle engine
        for (let i = 0; i < this.engines.length; i++) {
            if (!this.busyEngines.has(i)) {
                this.busyEngines.add(i);
                return this.engines[i];
            }
        }

        // Create a new engine if under the limit
        if (this.engines.length < this.maxEngines) {
            const engine = await MCPStockfish.create();
            await engine.init();
            const index = this.engines.length;
            this.engines.push(engine);
            this.busyEngines.add(index);
            return engine;
        }

        // Wait for an engine to become available
        return new Promise<MCPStockfish>((resolve) => {
            this.waitQueue.push(resolve);
        });
    }

    releaseEngine(engine: MCPStockfish): void {
        const index = this.engines.indexOf(engine);
        if (index !== -1) {
            this.busyEngines.delete(index);

            // If there's a waiting request, give it this engine
            if (this.waitQueue.length > 0) {
                const resolve = this.waitQueue.shift()!;
                this.busyEngines.add(index);
                resolve(engine);
            }
        }
    }

    async shutdown() {
        for (const engine of this.engines) {
            engine.shutdown();
        }
        this.engines = [];
        this.busyEngines.clear();
        this.waitQueue = [];
    }
}

