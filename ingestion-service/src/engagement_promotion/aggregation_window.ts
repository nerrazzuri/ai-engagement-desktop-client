import { EngagementSignal, AggregationContext } from './types';
import * as rules from './config/aggregation_rules.json';

export class AggregationWindow {
    // In a stateless run, we accept a list of historical signals to compare against.
    // "current" is the signal we are evaluating. "history" is the window context.
    static analyze(current: EngagementSignal, history: EngagementSignal[]): AggregationContext {
        let repeated_user = false;
        let repeated_video = false;
        let intent_escalation = false;
        let frequency_score = 0;
        let related_signals_count = 0;

        const currentTs = new Date(current.metadata.timestamp).getTime();
        const windowMs = (rules.window_minutes || 15) * 60 * 1000;

        // Filter valid history based on user_id (if present)
        const relevantHistory = history.filter(h => {
            const hTs = new Date(h.metadata.timestamp).getTime();
            const age = currentTs - hTs;

            // Allow simulated future/past if test data, but typically history is past.
            // window check: age should be < windowMs and > 0
            if (Math.abs(age) > windowMs) return false;

            // Match User
            if (current.metadata.user_id && h.metadata.user_id === current.metadata.user_id) {
                return true;
            }
            return false;
        });

        if (relevantHistory.length > 0) {
            repeated_user = true;
            related_signals_count = relevantHistory.length;

            // Frequency Score: history + current
            frequency_score = related_signals_count + 1;

            // Check if video is also the same
            if (relevantHistory.some(h => h.metadata.video_id === current.metadata.video_id)) {
                repeated_video = true;
            }

            // Check Escalation: Did user go from Low Priority -> High Priority?
            // Or Latent -> Regret?
            // "Escalation patterns (consideration -> regret)"
            const hadConsideration = relevantHistory.some(h =>
                h.opportunity.buying_stage === 'CONSIDERATION' || h.opportunity.buying_stage === 'AWARENESS'
            );

            if (['DECISION', 'REGRET'].includes(current.opportunity.buying_stage) && hadConsideration) {
                intent_escalation = true;
            }
        }

        return {
            repeated_user,
            repeated_video,
            intent_escalation,
            frequency_score,
            related_signals_count
        };
    }
}
