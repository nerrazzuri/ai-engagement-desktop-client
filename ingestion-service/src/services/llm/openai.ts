
import { LLMProvider, LLMCompletionRequest, LLMCompletionResponse } from './provider';

// Placeholder for real OpenAI implementation
// In a real scenario, this would import 'openai' package
export class OpenAIProvider implements LLMProvider {
    id = "openai-gpt-4o";
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
        if (!this.apiKey) {
            throw new Error("OpenAI API Key not configured");
        }

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini", // Use cost-effective model
                    messages: [
                        { role: "system", content: "You are a helpful assistant. Respond in JSON." },
                        { role: "user", content: request.prompt }
                    ],
                    temperature: request.temperature,
                    max_tokens: request.max_tokens,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json() as any;
            const content = data.choices[0].message.content;

            return {
                text: content,
                raw: data,
                usage: {
                    prompt_tokens: data.usage.prompt_tokens,
                    completion_tokens: data.usage.completion_tokens
                }
            };
        } catch (err: any) {
            console.error('[OpenAIProvider] Call Failed:', err);
            throw new Error(`OpenAI Provider Failed: ${err.message}`);
        }
    }
}
