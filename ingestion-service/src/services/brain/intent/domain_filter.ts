import { BrainInput, IntentDecision, StrategyType, BuyerIntentStrength } from '../types';
import { IntentClassifier } from './classifier';

export class EngagementDomainFilter {
    static async evaluate(input: BrainInput): Promise<IntentDecision> {
        const text = input.event.content_text;
        const classification = await IntentClassifier.classify(text);

        console.log(`[DomainFilter] Text: "${text}"`);
        console.log(`[DomainFilter] Classified: ${classification.intent} (${classification.strength})`);

        let allowed = true;
        let forcedStrategy: StrategyType | undefined;
        let reason = `Intent: ${classification.intent} (${classification.strength})`;

        // ==========================================
        // Phase 17H: Buyer Intent Policy Matrix
        // ==========================================

        switch (classification.intent) {
            // 1. Product Source Inquiry (HIGH)
            // "Where is this from?" -> Public Reply (if owner) or Capture (competitor)
            // Implementation: We default to ANSWER (Public Reply) for now as we act as 'Owner' agent.
            case 'PRODUCT_INQUIRY':
                allowed = true;
                forcedStrategy = 'ANSWER';
                break;

            // 2. Conditional Purchase (VERY_HIGH)
            // "I'd buy if smaller" -> SILENT_CAPTURE (Never Noise, Never Auto-Reply)
            case 'LATENT_PURCHASE':
                allowed = true;
                forcedStrategy = 'SILENT_CAPTURE'; // CRITICAL CHANGE: Was IGNORE, is now CAPTURE
                reason += " -> Latent Interception";
                break;

            // 3. Regret / Missed Opp (IMMEDIATE)
            // "Just bought something else" -> SILENT_CAPTURE
            case 'POST_PURCHASE_REGRET':
                allowed = true;
                forcedStrategy = 'SILENT_CAPTURE';
                reason += " -> Immediate Regret Capture";
                break;
            // 4. Problem-First (MEDIUM->HIGH)
            // "My eyeliner smudges" -> SILENT_CAPTURE (Default)
            // Only reply if explicitly asked. We default to CAPTURE to be safe.
            // If the Engine determines it has a great solution, it might promote to ANSWER? 
            // For now, strict safety: Capture, don't solicit.
            case 'PROBLEM_SOLUTION':
                allowed = true;
                forcedStrategy = 'SILENT_CAPTURE';
                break;

            // 5. Fit / Suitability (HIGH)
            // "Suits my skin?" -> CAPTURE (Default) or ANSWER if confident.
            case 'FIT_SUITABILITY':
                allowed = true;
                forcedStrategy = 'SILENT_CAPTURE';
                break;

            case 'UNKNOWN':
                allowed = true;
                forcedStrategy = 'OBSERVE_ONLY';
                break;

            case 'SOCIAL':
                // Check strength? Or just Noise for now unless high strength?
                // Plan said: Exclude Social from UNKNOWN.
                // But if Classifier returns SOCIAL (from where? Classifier doesn't return SOCIAL in Composition Logic except via "default" or "Noise" check?)
                // Wait, Classifier `composeIntent` doesn't have a SOCIAL return path. It returns NOISE if Social/Praise/Hostile.
                // Ah, the classifier returns NOISE for social chatter.
                // So this case might be unreachable unless I change Classifier to return SOCIAL.
                // I will set allowed = false for now.
                allowed = false;
                break;

            case 'NOISE':
            case 'HOSTILE':
                allowed = false;
                break;

            case 'INFO_SEEKING':
                allowed = true;
                // No forced strategy
                break;


            case 'NOISE':
            default:
                allowed = false;
                reason = "Blocked: Noise";
                break;
        }

        // SAFETY NET: High Intent MUST NOT be IGNORED
        const highValueStrengths: BuyerIntentStrength[] = ['HIGH', 'VERY_HIGH', 'IMMEDIATE'];
        if (!allowed && highValueStrengths.includes(classification.strength)) {
            console.warn(`[DomainFilter] SAFETY OVERRIDE: Rescuing High Intent (${classification.intent}) from Block.`);
            allowed = true;
            forcedStrategy = 'SILENT_CAPTURE';
            reason = "Safety Override: High Intent Rescue";
        }

        return {
            allowed,
            forcedStrategy,
            reason,
            intent: classification.intent,
            strength: classification.strength
        };
    }
}
