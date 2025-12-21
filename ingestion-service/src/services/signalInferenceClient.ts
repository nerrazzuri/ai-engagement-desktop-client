
import { DetectedSignal } from './brain/types';

export interface InferenceRequest {
    text: string;
    existing_signals: DetectedSignal[];
}

export interface InferenceResponse {
    inferred_signals: DetectedSignal[];
}

export class SignalInferenceClient {
    private baseUrl: string;
    private timeoutMs: number = 5000;

    constructor() {
        this.baseUrl = process.env.AI_CORE_BASE_URL || process.env.AI_CORE_URL || 'http://localhost:8000';
    }

    async inferSignals(text: string, existingSignals: DetectedSignal[]): Promise<DetectedSignal[]> {
        const url = `${this.baseUrl}/v1/internal/signal-inference`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': process.env.AI_CORE_INTERNAL_SECRET || ''
                },
                body: JSON.stringify({
                    text
                    // existing_signals: existingSignals // Causing 422? User curl used text only.
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[SignalInference] Failed: ${response.status} ${response.statusText}`);
                return [];
            }

            const data = await response.json() as any;

            // Validate and Map Response
            if (!data.inferred_signals || !Array.isArray(data.inferred_signals)) {
                return [];
            }

            // Adapter: AI-Core Types -> Brain Categories
            return data.inferred_signals.map((s: any) => {
                let category: any = 'CONTEXT'; // Default
                let signal = s.type ? s.type.toLowerCase() : 'unknown';

                // Heuristic Mapping
                if (s.type === 'VALUE_EVALUATION') {
                    category = 'ATTRIBUTE';
                    signal = 'value'; // Triggers Latent Purchase if Conditional present
                } else if (s.type === 'COST_BENEFIT_HESITATION') {
                    category = 'CONDITIONAL';
                    signal = 'hesitation';
                } else if (s.type === 'SIZE_FIT_ISSUE') {
                    category = 'ATTRIBUTE';
                    signal = 'size';
                } else if (s.type === 'AESTHETIC_PREFERENCE') {
                    category = 'PREFERENCE';
                    signal = 'aesthetic';
                }

                return {
                    category: category,
                    signal: signal,
                    id: `ai_${signal}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
                } as DetectedSignal;
            });

        } catch (err: any) {
            // SILENT FAIL (Logs only)
            if (err.name === 'AbortError') {
                console.warn(`[SignalInference] Timeout exceeded (${this.timeoutMs}ms)`);
            } else {
                console.warn(`[SignalInference] Network Error: ${err.message}`);
            }
            return [];
        }
    }
}

export const signalInferenceClient = new SignalInferenceClient();
