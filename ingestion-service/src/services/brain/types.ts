
export type StrategyType = 'ANSWER' | 'ACKNOWLEDGE' | 'DEFLECT' | 'IGNORE' | 'DE_ESCALATE' | 'ASK_FOLLOWUP';

export interface Strategy {
    type: StrategyType;
    confidence: number;
    rationale: string;
}

export interface TenantContext {
    tenant_id: string;
    tone: 'PROFESSIONAL' | 'CASUAL' | 'FRIENDLY' | 'URGENT';
    avg_reply_length: 'SHORT' | 'MEDIUM' | 'LONG';
    prohibited_keywords: string[];
}

export interface HistoricalSignals {
    total_suggestions: number;
    ignored_count: number;
    edited_count: number;
    avg_edit_distance: number;
}

export interface RequestContext {
    regeneration_count: number;
    user_intent: 'MANUAL_SUGGESTION';
}

export interface BrainInput {
    event: {
        platform: string;
        video_id: string;
        author_name: string | null;
        content_text: string;
    };
    tenant: TenantContext;
    history: HistoricalSignals;
    request: RequestContext;
}

export interface BrainResponse {
    text: string;
    strategy: StrategyType;
    confidence: number;
    explanation: string;
    decision_trace: any;
    model?: string; // Phase 14
    version: string;
    cache_hit?: boolean; // Phase 14 Cache Field
}
