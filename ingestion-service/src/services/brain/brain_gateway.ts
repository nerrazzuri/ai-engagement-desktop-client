
import { CapabilityRequest, CapabilityResponse, JsonValue } from '../../core/contracts';
import { BrainInput, StrategyType } from './types';
import { BrainEngine } from './brain_engine';
import { EngagementDomainFilter } from './intent/domain_filter';
import { SafetyService } from '../safety/safety_service';

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
            content_text: request.input.query,
            account_id: rawAny.account_id || null // Gap B Fix
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

        // --- PHASE 19: SAFETY PRE-CHECK ---
        const target = {
            platform: brainInput.event.platform,
            target_id: `${brainInput.event.platform}:${brainInput.event.author_name || 'unknown'}`,
            accountId: brainInput.event.account_id || 'unknown' // Phase 19.5
        };

        const preCheck = await SafetyService.preCheck(target);

        // Block if not allowed AND not a shadow violation
        if (!preCheck.allowed && !preCheck.is_shadow_violation) {
            return {
                kind: 'ignore',
                payload: { text: '', strategy: 'IGNORE' },
                confidence: 0,
                policy_decisions: {
                    explanation: `Safety Pre-Check Failed: ${preCheck.reason}`,
                    trace: { safety_rule: preCheck.rule_id }
                }
            };
        }
        // ----------------------------------
        // Phase 20: Owner Controls
        // 1. Fetch Settings
        const workspaceId = brainInput.event.account_id;
        let ownerSettings = null;
        if (workspaceId) {
            const { OwnerSettingsService } = require('../owner/owner_settings_service');
            ownerSettings = await OwnerSettingsService.getSettings(workspaceId);
            brainInput.ownerSettings = ownerSettings;
        }

        if (ownerSettings) {
            // 2. Owner Caps Check
            const { BusinessLimitsService } = require('../owner/business_limits_service');
            const capCheck = await BusinessLimitsService.checkCaps(workspaceId, ownerSettings, brainInput.event.video_id);

            if (capCheck.capped) {
                return {
                    kind: 'ignore', // Downgrade to Ignore/Silent
                    payload: { text: '', strategy: 'IGNORE' },
                    confidence: 0,
                    policy_decisions: {
                        explanation: `Owner Cap Hit: ${capCheck.reason}`,
                        trace: { cap_reason: capCheck.reason }
                    }
                };
            }

            // 3. Mode Check (Short Circuit)
            if (ownerSettings.mode === 'OBSERVE_ONLY') {
                const decision = await EngagementDomainFilter.evaluate(brainInput); // Log intent anyway
                return {
                    kind: 'ignore', // Silent Capture
                    payload: { text: '', strategy: 'SILENT_CAPTURE' as StrategyType }, // TS Cast for now
                    confidence: 0,
                    policy_decisions: {
                        explanation: 'Owner Mode: OBSERVE_ONLY',
                        trace: { mode: 'OBSERVE_ONLY', intent: decision.intent }
                    }
                };
            }
        }

        const decision = await EngagementDomainFilter.evaluate(brainInput);

        if (!decision.allowed) {
            return {
                kind: 'ignore', // Explicit ignore for blocked intents
                payload: {
                    text: '',
                    strategy: 'IGNORE'
                },
                confidence: 0,
                policy_decisions: {
                    explanation: decision.reason,
                    trace: { intent: decision.intent, forced: false }
                }
            };
        }

        // Enrich Input with Intent Decisions for Engine
        brainInput.intent_context = {
            intent: decision.intent,
            forced_strategy: decision.forcedStrategy
        };

        // 4. Call Engine (Pure Intelligence)
        const brainResp = await BrainEngine.generateSuggestion(brainInput);

        // --- PHASE 19: SAFETY POST-CHECK ---
        let finalStrategy = brainResp.strategy;
        let explanation = brainResp.explanation;

        const postCheck = await SafetyService.postCheck(target, brainInput.event.video_id, finalStrategy);

        if (!postCheck.allowed) {
            if (postCheck.is_shadow_violation) {
                // Log but don't act
                explanation += ` [SHADOW: Would have downgraded to ${postCheck.override_strategy} due to ${postCheck.reason}]`;
            } else {
                // ACTION: Downgrade
                finalStrategy = postCheck.override_strategy || 'IGNORE';
                explanation = `Safety Post-Check (${postCheck.reason}): Downgraded to ${finalStrategy}`;
                // If ID is IGNORE, clear text
                if (finalStrategy === 'IGNORE') {
                    brainResp.text = '';
                }
            }
        }
        // -----------------------------------

        // 4. Map to Canonical Response
        return {
            kind: mapStrategyToKind(finalStrategy),
            payload: {
                text: brainResp.text,
                strategy: finalStrategy
            },
            confidence: brainResp.confidence,
            policy_decisions: {
                explanation: explanation,
                trace: {
                    ...brainResp.decision_trace,
                    safety_trace: {
                        pre_rule: preCheck.rule_id,
                        post_rule: postCheck.rule_id,
                        shadow: !!postCheck.is_shadow_violation
                    }
                }
            } as any
        };
    }
};
