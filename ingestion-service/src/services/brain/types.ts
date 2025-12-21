
export type StrategyType =
    | 'ANSWER'
    | 'ACKNOWLEDGE'
    | 'DEFLECT'
    | 'IGNORE'
    | 'DE_ESCALATE'
    | 'ASK_FOLLOWUP'
    | 'SILENT_CAPTURE' // Phase 17H: Intercept high intent without reply
    | 'OBSERVE_ONLY';  // Phase 17H: Log but don't capture

export type BuyerIntentStrength =
    | 'NONE'
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH'
    | 'VERY_HIGH'
    | 'IMMEDIATE';

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
        account_id?: string; // Phase 19.5
    };
    tenant: TenantContext;
    history: HistoricalSignals;
    request: RequestContext;
    intent_context?: {
        intent: EngagementIntent;
        forced_strategy?: StrategyType;
        score?: number;
    };
    ownerSettings?: import('@prisma/client').OwnerSettings; // Phase 20: Owner Controls
}

// BrainResponse is now defined below with Phase 23 fields.

// ==========================================
// Phase 17C Types: Intent System
// ==========================================

export type EngagementIntent =
    | 'NOISE'
    | 'SOCIAL'
    | 'INFO_SEEKING'
    | 'PROBLEM_SOLUTION'
    | 'LATENT_PURCHASE'
    | 'PRODUCT_INQUIRY'
    | 'POST_PURCHASE_REGRET'
    | 'HOSTILE'
    | 'FIT_SUITABILITY'
    | 'UNKNOWN';

export interface IntentRule {
    id: string;
    intent: EngagementIntent;
    family: string;
    language: string; // e.g. "en"
    signal: string;   // word or phrase to match
    weight: number;
    niche?: string;
    is_active: boolean;
    requires?: string[];
    excludes?: string[];
}

export interface IntentMatch {
    intent: EngagementIntent;
    score: number;
    families: string[];
}

export type SignalCategory =
    | 'EVALUATIVE'
    | 'CONTEXT'
    | 'ATTRIBUTE'
    | 'CONDITIONAL'
    | 'PRODUCT_REF'
    | 'PRONOUN'
    | 'PROBLEM'
    | 'REGRET'
    | 'INTERROGATIVE_WORD'
    | 'INTERROGATIVE_PUNCT'
    | 'SOURCE'
    | 'PRAISE'
    | 'SOCIAL'
    | 'HOSTILE'
    | 'PREFERENCE'
    | 'USAGE_CONTEXT';

export interface SignalDef {
    id: string;
    signal: string;
}

export interface DetectedSignal {
    category: SignalCategory; // Inferred from filename
    signal: string;
    id: string;
}

export interface IntentClassificationResult {
    intent: EngagementIntent;
    confidence: number;
    detected_intents: IntentMatch[]; // Deprecated but kept for compat? Or remove?
    // Let's keep it empty or mock it if needed by other components, but effectively unused.
    strength: BuyerIntentStrength;
    signals: DetectedSignal[]; // New Composition Evidence
    evidence: {
        matched_families: string[];
        matched_signals: string[];
        language: string;
        scores: Record<EngagementIntent, number>;
    };
}

// ==========================================
// Phase 23: Context & Safety
// ==========================================

export enum ContextType {
    OWNED_CONTENT = 'OWNED_CONTENT',
    COMPETITOR_CONTENT = 'COMPETITOR_CONTENT',
    THIRD_PARTY_NEUTRAL = 'THIRD_PARTY_NEUTRAL',
    UNKNOWN_CONTEXT = 'UNKNOWN_CONTEXT'
}

export enum SpeakerRole {
    OWNER = 'OWNER',
    NEUTRAL_HELPER = 'NEUTRAL_HELPER',
    ALTERNATIVE_PROVIDER = 'ALTERNATIVE_PROVIDER'
}

export enum TemplateCategory {
    NEUTRAL_ADVICE = 'NEUTRAL_ADVICE',
    EXPERIENCE_BASED = 'EXPERIENCE_BASED',
    ALTERNATIVE_MENTION = 'ALTERNATIVE_MENTION',
    OWNER_PROMOTIONAL = 'OWNER_PROMOTIONAL'
}

export interface ContextDecision {
    context_type: ContextType;
    speaker_role: SpeakerRole;
    template_category: TemplateCategory;
    rationale: string;
}

export interface IntentDecision {
    allowed: boolean;
    forcedStrategy?: StrategyType;
    reason: string;
    intent: EngagementIntent;
    strength: BuyerIntentStrength;
}

// Updated Brain Response to include decision trace
export interface BrainResponse {
    text: string;
    strategy: StrategyType;
    confidence: number;
    explanation: string;
    decision_trace: {
        intent?: IntentDecision;
        context?: ContextDecision;
        [key: string]: any;
    };
    model?: string; // Phase 14
    version: string;
    cache_hit?: boolean; // Phase 14 Cache Field
}
