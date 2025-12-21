import { EngagementSignal, AggregationContext } from './types';
import * as thresholds from './config/promotion_thresholds.json';

export class PromotionRules {
    static evaluate(
        score: number,
        signal: EngagementSignal,
        context: AggregationContext
    ): { status: 'PROMOTED' | 'DEFERRED' | 'SUPPRESSED'; reason: string } {

        const stage = signal.opportunity.buying_stage;
        const level = signal.opportunity.opportunity_level;

        // Rule 1: Always Suppress specific levels (IGNORE)
        if ((thresholds.always_suppress_levels as string[]).includes(level)) {
            return { status: 'SUPPRESSED', reason: 'Level included in suppression list' };
        }

        // Rule 2: Regret Bypass
        if ((thresholds.always_promote_stages as string[]).includes(stage)) {
            return { status: 'PROMOTED', reason: 'Critical Stage (Regret) Bypass' };
        }

        // Rule 3: Score Thresholds
        if (score >= (thresholds.promote_above || 80)) {
            return { status: 'PROMOTED', reason: `Score ${score.toFixed(0)} >= ${thresholds.promote_above}` };
        }

        if (score <= (thresholds.suppress_below || 50)) {
            return { status: 'SUPPRESSED', reason: `Score ${score.toFixed(0)} <= ${thresholds.suppress_below}` };
        }

        return { status: 'DEFERRED', reason: `Score ${score.toFixed(0)} in queue range` };
    }
}
