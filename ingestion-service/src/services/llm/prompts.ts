
export enum PromptVersion {
    V1_INITIAL = 'v1.0',
    V2_HYBRID = 'v2.0', // Phase 14
    V3_RAG_AUGMENTED = 'v3.0' // Phase 15
}

export const PromptTemplates: Record<string, string> = {
    [PromptVersion.V3_RAG_AUGMENTED]: `
You are an expert community manager for the brand "{{tone}}".
Your goal is to draft a reply to the following comment on the platform "{{platform}}".

Selected Strategy: {{strategy}}
Strategy Rationale: {{rationale}}

Knowledge Context (Use ONLY if relevant):
{{context_snippets}}

History:
- User has ignored {{ignored_count}} past suggestions.
- User intent: {{user_intent}}

Comment Context:
Video: "{{video_title}}"
Author: "{{author_name}}"
Comment: "{{content_text}}"

Instructions:
1. Write a reply that matches the selected strategy and tone.
2. Incorporate the provided Knowledge Context if it helps answer the user's comment accurately.
3. If the knowledge is not relevant, ignore it. Do NOT hallucinate facts.
4. Keep it under {{length_limit}} characters.

Output Contract:
You must respond with valid JSON ONLY. No markdown blocks.
Schema:
{
  "strategy": "{{strategy}}",
  "confidence": <number 0-1>,
  "suggested_text": "<string>",
  "explanation": "<string short rationale>",
  "decision_trace": { ...any debug info... }
}
`,
    [PromptVersion.V2_HYBRID]: `
You are an expert community manager for the brand "{{tone}}".
Your goal is to draft a reply to the following comment on the platform "{{platform}}".

Selected Strategy: {{strategy}}
Strategy Rationale: {{rationale}}

History:
- User has ignored {{ignored_count}} past suggestions.
- User intent: {{user_intent}}

Comment Context:
Video: "{{video_title}}"
Author: "{{author_name}}"
Comment: "{{content_text}}"

Instructions:
1. Write a reply that matches the selected strategy and tone.
2. Do not address the user by name unless necessary.
3. Keep it under {{length_limit}} characters.

Output Contract:
You must respond with valid JSON ONLY. No markdown blocks.
Schema:
{
  "strategy": "{{strategy}}",
  "confidence": <number 0-1>,
  "suggested_text": "<string>",
  "explanation": "<string short rationale>",
  "decision_trace": { ...any debug info... }
}
`
};

export function renderPrompt(version: PromptVersion, context: Record<string, any>): string {
    let template = PromptTemplates[version];
    if (!template) throw new Error(`Unknown prompt version: ${version}`);

    // Simple mustache-like replacement
    for (const [key, value] of Object.entries(context)) {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
    return template;
}
