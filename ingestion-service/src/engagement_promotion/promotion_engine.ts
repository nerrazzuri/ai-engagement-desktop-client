import { EngagementSignal, PromotedEngagement } from './types';
import { AggregationWindow } from './aggregation_window';
import { PriorityScorer } from './priority_scorer';
import { PromotionRules } from './promotion_rules';

export class PromotionEngine {
    /**
     * Process a list of signals contextually.
     * In a real stream, 'history' would be fetched from DB.
     * Here we simulate processing a batch where earlier items in the list are "history" for later items.
     */
    static process(signals: EngagementSignal[]): PromotedEngagement[] {
        const results: PromotedEngagement[] = [];
        const processedHistory: EngagementSignal[] = [];

        // Sort by timestamp just in case
        const sortedSignals = [...signals].sort((a, b) =>
            new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime()
        );

        for (const signal of sortedSignals) {
            // 1. Aggregation Context
            const context = AggregationWindow.analyze(signal, processedHistory);

            // 2. Priority Scoring
            const score = PriorityScorer.calculate(signal, context);

            // 3. Promotion Decision
            const decision = PromotionRules.evaluate(score, signal, context);

            // 4. Result Construction
            results.push({
                opportunity_id: signal.metadata.comment_id,
                priority_score: score,
                promotion_reason: decision.reason,
                recommended_action: signal.opportunity.recommended_action,
                aggregation_context: context,
                status: decision.status,
                signal: signal
            });

            // Add to history for subsequent items
            processedHistory.push(signal);
        }

        // Return only what is needed? Or all statuses?
        // Prompt says "Output ordered PromotedEngagement[]"
        // Usually we filter out SUPPRESSED? 
        // Or return all and let caller filter? 
        // "Which should be suppressed... decide... output ordered".
        // I'll return all, but sort by Priority Score DESC.
        return results.sort((a, b) => b.priority_score - a.priority_score);
    }
}
