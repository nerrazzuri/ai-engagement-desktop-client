import { IntentClassificationResult } from '../services/brain/types';
import { EngagementOpportunity } from './types';
import { BuyingStageMapper } from './buying_stage_mapper';
import { OpportunityScorer } from './opportunity_scorer';
import { ActionPolicyEngine } from './action_policy';
import { UnknownIntentLogger } from './unknown_intent_logger';

export class OpportunityEngine {
    static evaluate(classification: IntentClassificationResult, rawText: string, commentId?: string): EngagementOpportunity {
        // 1. Unknown / Low Confidence Logging
        if (classification.intent === 'NOISE' && classification.confidence < 0.5) {
            UnknownIntentLogger.log({
                comment_id: commentId,
                raw_text: rawText,
                normalized_text: rawText, // Ideally pass normalized from classifier
                detected_intents: classification.detected_intents,
                reason: 'LOW_CONFIDENCE',
                timestamp: new Date().toISOString()
            });
        }

        // 2. Map Buying Stage
        const primaryIntent = classification.intent;
        const supportingIntents = classification.detected_intents.map(d => d.intent).filter(i => i !== primaryIntent);
        const stage = BuyingStageMapper.map(primaryIntent, supportingIntents);

        // 3. Score Opportunity
        // Using rawText for modifiers (e.g. punctuation, casing might matter, but Scorer re-normalizes or checks raw?)
        // Scorer expects normalized text for modifiers? The prompt said "normalized input".
        // Classification result doesn't export normalized text. 
        // We will simple-normalize here for scorer or assume raw is fine for basic keywords.
        // Let's lowercase rawText.
        const normalized = rawText.toLowerCase();
        const { score, level, signals } = OpportunityScorer.score(primaryIntent, normalized);

        // 4. Determine Action
        const action = ActionPolicyEngine.determineAction(level, stage);

        // 5. Construct Opportunity
        return {
            opportunity_level: level,
            buying_stage: stage,
            urgency_score: score,
            primary_intent: primaryIntent,
            supporting_intents: supportingIntents,
            recommended_action: action,
            explanation: {
                summary: `Rated ${level} (${score}) at ${stage} stage. Action: ${action}`,
                signals: signals,
                matched_phrases: classification.evidence.matched_signals
            }
        };
    }
}
