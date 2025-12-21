import { EngagementSignal, AggregationContext } from './types';
import * as weights from './config/priority_weights.json';

export class PriorityScorer {
    static calculate(signal: EngagementSignal, context: AggregationContext): number {
        let score = signal.opportunity.urgency_score * (weights.base_weight_urgency || 1.0);

        // Boosts
        if (context.repeated_user) {
            score += (weights.weight_repetition || 10.0);
        }
        if (context.intent_escalation) {
            score += (weights.weight_escalation || 20.0);
        }

        // Frequency boost (up to a point)
        score += (context.frequency_score * (weights.weight_frequency || 5.0));

        // Penalties (Spam protection)
        // If frequency is too high (e.g. > 5 messages in window), apply penalty
        if (context.frequency_score > 5) {
            score += (weights.penalty_spam || -50.0);
        }

        return Math.max(0, Math.min(100, score));
    }
}
