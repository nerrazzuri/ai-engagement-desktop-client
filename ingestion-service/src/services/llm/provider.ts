
export interface LLMCompletionRequest {
    prompt: string;
    temperature: number;
    max_tokens: number;
    stop?: string[];
}

export interface LLMCompletionResponse {
    text: string;
    raw: any; // Raw provider response
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}

export interface LLMProvider {
    id: string;
    generateCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}

export class MockProvider implements LLMProvider {
    id = "mock-provider";

    async generateCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
        // D/E. Error Trigger
        if (request.prompt.includes('trigger_llm_fail')) {
            throw new Error("Simulated LLM Provider Failure");
        }

        // Parse strategy from prompt to match Brain's intent
        const strategyMatch = request.prompt.match(/Selected Strategy: (\w+)/);
        const strategy = strategyMatch ? strategyMatch[1] : "ANSWER";

        // Simulating JSON response from LLM
        const mockJson = {
            strategy: strategy,
            confidence: 0.95,
            suggested_text: `Mock LLM Suggestion (${strategy}): Thanks for asking! [Generated Content]`,
            explanation: "Mock LLM Explanation",
            decision_trace: { step: "mock_inference" }
        };

        return {
            text: JSON.stringify(mockJson),
            raw: { mock: true },
            usage: {
                prompt_tokens: 10,
                completion_tokens: 20
            }
        };
    }
}
