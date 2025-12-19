
export interface RagQuery {
    query: string;
    tenant_id: string;
    max_snippets: number;
}

export interface RagResult {
    snippets: string[];
    sources: string[];
    confidence: number;
}

export interface RagClient {
    query(request: RagQuery): Promise<RagResult>;
}

export class MockRagClient implements RagClient {
    // WARNING: MockRagClient is for Phase 15 only.
    // MUST be replaced by real RAG HTTP client before production.
    async query(request: RagQuery): Promise<RagResult> {
        const q = request.query.toLowerCase();

        // A. Timeout Trigger
        if (q.includes('timeout_test')) {
            await new Promise(r => setTimeout(r, 1500)); // > 800ms
        } else {
            // Normal fast latency
            await new Promise(r => setTimeout(r, 50));
        }

        // B. Low Confidence Trigger
        if (q.includes('low_conf_test')) {
            return {
                snippets: ["Irrelevant snippet 1", "Irrelevant snippet 2"],
                sources: ["doc:irrelevant"],
                confidence: 0.5 // Below 0.7 threshold
            };
        }

        // Standard Logic matches Phase 15 requirements
        // Mock Logic: Return snippets if query contains "price" or "policy"
        if (q.includes('price') || q.includes('policy')) {
            return {
                snippets: [
                    "Our standard pricing is $10/month for basic, $20/month for pro.",
                    "Refund policy allows full refund within 30 days."
                ],
                sources: ["doc:pricing_2025", "faq:refunds"],
                confidence: 0.95
            };
        }

        return {
            snippets: [],
            sources: [],
            confidence: 0
        };
    }
}
