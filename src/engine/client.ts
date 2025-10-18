// MCPStockfishHTTP.ts
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface EvaluationRequest {
    fen: string;
    depth: number;
    multiPv?: number;
}

export interface EvaluationResult {
    bestMove?: string;
    evaluation?: number;
    pv?: string[];
    lines?: any[];
}

export class MCPStockfishHTTP {
    private client: AxiosInstance;

    constructor(host: string = 'localhost', port: number = 3001) {
        this.client = axios.create({
            baseURL: `http://${host}:${port}`,
            
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    async checkHealth(): Promise<boolean> {
        try {
            const response = await this.client.get('/health', {
                timeout: 5000
            });
            return response.status === 200;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    async evaluatePosition(params: EvaluationRequest): Promise<EvaluationResult> {
        try {
            const response = await this.client.post('/evaluate', params, {
            });
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError<{ error: string }>;
                const errorMessage = axiosError.response?.data?.error || axiosError.message;
                console.error('Evaluation failed:', errorMessage);
                throw new Error(errorMessage);
            }
            console.error('Evaluation failed:', error);
            throw error;
        }
    }

    async getBestMove(fen: string, depth: number = 15): Promise<{ bestMove: string; evaluation: number }> {
        try {
            const response = await this.client.post('/bestmove', { fen, depth }, {
            });
            return {
                bestMove: response.data.bestMove,
                evaluation: response.data.evaluation
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError<{ error: string }>;
                const errorMessage = axiosError.response?.data?.error || axiosError.message;
                console.error('Best move request failed:', errorMessage);
                throw new Error(errorMessage);
            }
            console.error('Best move request failed:', error);
            throw error;
        }
    }

    async analyzeBatch(positions: EvaluationRequest[]): Promise<Array<{ fen: string; result: EvaluationResult }>> {
        try {
            const response = await this.client.post('/analyze-batch', { positions }, {
            });
            return response.data.results;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError<{ error: string }>;
                const errorMessage = axiosError.response?.data?.error || axiosError.message;
                console.error('Batch analysis failed:', errorMessage);
                throw new Error(errorMessage);
            }
            console.error('Batch analysis failed:', error);
            throw error;
        }
    }
}