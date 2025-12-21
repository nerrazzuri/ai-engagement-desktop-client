import { PromotedEngagement } from '../engagement_promotion/types';
import { BaseAction } from './types';
import * as escalationRules from './config/escalation_rules.json';

export class ActionRouter {
    static route(engagement: PromotedEngagement): BaseAction {
        const { status, priority_score, signal } = engagement;
        const { buying_stage, opportunity_level, recommended_action } = signal.opportunity;

        if (status === 'SUPPRESSED') return 'NO_ACTION';
        if (status === 'DEFERRED') return 'NO_ACTION'; // Or maybe 'PUBLIC_REPLY' but low prio? For now, NO_ACTION until promoted.

        // Rule 1: Explicit Escalation
        if (escalationRules.always_escalate_stages.includes(buying_stage)) {
            return 'ESCALATE';
        }

        // Rule 2: Critical Level -> Follow Recommended (DM/Escalate)
        if (opportunity_level === 'CRITICAL') {
            // If recommended is DM, verify if we should escalate instead?
            // "CRITICAL -> DM or ESCALATE"
            if (recommended_action === 'ESCALATE') return 'ESCALATE';
            return 'DM';
        }

        // Rule 3: High/Medium -> Reply
        if (opportunity_level === 'HIGH' || opportunity_level === 'MEDIUM') {
            if (recommended_action === 'DM') return 'DM';
            return 'PUBLIC_REPLY';
        }

        // Rule 4: Low -> Reply (if promoted)
        if (opportunity_level === 'LOW') {
            return 'PUBLIC_REPLY';
        }

        // Fallback
        return 'NO_ACTION';
    }
}
