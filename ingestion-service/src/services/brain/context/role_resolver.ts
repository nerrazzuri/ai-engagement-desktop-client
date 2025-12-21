
import { OwnerSettings } from '@prisma/client';
import { ContextType, SpeakerRole, IntentDecision, BuyerIntentStrength } from '../types';

export class RoleResolver {
    static resolve(
        context: ContextType,
        intent: IntentDecision,
        settings: OwnerSettings,
        confidence: number
    ): SpeakerRole {
        // 1. OWNED Rules
        if (context === ContextType.OWNED_CONTENT) {
            return SpeakerRole.OWNER;
        }

        // 2. COMPETITOR / UNKNOWN Rules
        // Default Safety
        let role = SpeakerRole.NEUTRAL_HELPER;

        // 3. Alternative Provider Escalation Logic
        // STRICT CRITERIA:
        // - High Intent
        // - High Confidence
        // - Aggressiveness is NOT CONSERVATIVE
        // - Intent Type is specific (Problem/Purchase)

        const isAggressive = settings.aggressiveness === 'ASSERTIVE' || settings.aggressiveness === 'BALANCED';
        const isHighIntent = intent.strength === 'HIGH' || intent.strength === 'VERY_HIGH' || intent.strength === 'IMMEDIATE';
        const isSalesIntent =
            intent.intent === 'PRODUCT_INQUIRY' ||
            intent.intent === 'LATENT_PURCHASE' ||
            intent.intent === 'PROBLEM_SOLUTION' ||
            intent.intent === 'FIT_SUITABILITY';

        if (isAggressive && isHighIntent && isSalesIntent && confidence >= 0.85) {
            role = SpeakerRole.ALTERNATIVE_PROVIDER;
        }

        return role;
    }
}
