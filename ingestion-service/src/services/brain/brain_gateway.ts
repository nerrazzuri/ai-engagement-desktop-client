
import { CapabilityRequest, CapabilityResponse, JsonValue } from '../../core/contracts';
import { BrainInput, StrategyType } from './types';
import { BrainEngine } from './brain_engine';

// ==========================================
// Phase 17: Brain Gateway (Boundary)
// ==========================================

function assertCapabilityVersion(req: CapabilityRequest) {
    if (req.version !== 'v1') {
        throw new Error(`Unsupported capability version: ${req.version}`);
    }
}

function extractRawEvent(context: Record<string, JsonValue | undefined>) {
    const raw = context.raw_event;
    // Basic object check (in JS 'null' is object)
    return (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) ? raw : {};
}

function mapStrategyToKind(strategy: StrategyType): CapabilityResponse['kind'] {
    switch (strategy) {
        case 'IGNORE':
            return 'error'; // Mapping IGNORE to error/silent for now as per instruction
        case 'ACKNOWLEDGE':
        case 'ANSWER':
        case 'DE_ESCALATE':
        case 'ASK_FOLLOWUP':
            return 'answer';
        default:
            return 'answer';
    }
}

function mapCapabilityToBrainInput(request: CapabilityRequest): BrainInput {
    // 1. Extract Raw Event softly
    const rawContext = extractRawEvent(request.context);
    // Safer access to properties on JsonValue (using ‘as any’ inside the mapper is contained)
    const rawAny = rawContext as any;

    return {
        event: {
            platform: rawAny.platform || 'unknown',
            video_id: rawAny.video_id || 'unknown',
            author_name: rawAny.creator_name || rawAny.commenter_name || null,
            content_text: request.input.query
        },
        tenant: {
            // If tenant_id is missing, use 'unknown' (do not invent identity)
            tenant_id: request.tenant_id ?? 'unknown',
            tone: 'PROFESSIONAL',
            avg_reply_length: 'MEDIUM',
            prohibited_keywords: []
        },
        history: {
            total_suggestions: 0,
            ignored_count: 0,
            edited_count: 0,
            avg_edit_distance: 0
        },
        request: {
            regeneration_count: 0,
            user_intent: 'MANUAL_SUGGESTION'
        }
    };
}

export const BrainGateway = {
    async processCapability(request: CapabilityRequest): Promise<CapabilityResponse> {
        // 1. Guard
        assertCapabilityVersion(request);

        // 2. Map
        const brainInput = mapCapabilityToBrainInput(request);

        // 3. Call Engine (Pure Intelligence)
        const brainResp = await BrainEngine.generateSuggestion(brainInput);

        // 4. Map to Canonical Response
        return {
            kind: mapStrategyToKind(brainResp.strategy),
            payload: {
                text: brainResp.text,
                strategy: brainResp.strategy
            },
            confidence: brainResp.confidence,
            policy_decisions: {
                explanation: brainResp.explanation,
                trace: brainResp.decision_trace
            }
        };
    }
};
