import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class StockfishProcess {
    engine;
    constructor() {
        const enginePath = path.join(__dirname, "../../node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.js");
        this.engine = spawn(process.execPath, [enginePath], {
            stdio: "pipe",
            env: {
                ...process.env,
                NODE_ENV: "production", // reduce noise
            },
        });
        this.engine.stderr.on("data", (data) => {
            console.error("Stockfish STDERR:", data.toString());
        });
    }
    send(cmd) {
        this.engine.stdin.write(cmd + "\n");
    }
    onMessage(cb) {
        this.engine.stdout.on("data", (data) => {
            const lines = data.toString().split("\n").filter(Boolean);
            lines.forEach((line) => {
                if (this.isValidUCIMessage(line)) {
                    cb(line);
                }
            });
        });
    }
    isValidUCIMessage(line) {
        const uciPrefixes = [
            "id ",
            "uciok",
            "readyok",
            "bestmove",
            "info ",
            "option ",
            "Stockfish",
            "position",
            "copyprotection",
            "registration",
        ];
        const invalidPatterns = [
            /^\d{4}-\d{2}-\d{2}/, // timestamps
            /\[info\]/i,
            /\[error\]/i,
            /appVersion/i,
            /isPackaged/i,
            /Checking for updates/i,
            /Starting app/i,
            /^[\s{}\[\]]*$/, // braces or whitespace only
        ];
        for (const pattern of invalidPatterns) {
            if (pattern.test(line))
                return false;
        }
        const trimmed = line.trim();
        return uciPrefixes.some((prefix) => trimmed.startsWith(prefix)) || trimmed.length > 0;
    }
    quit() {
        this.engine.kill();
    }
}
