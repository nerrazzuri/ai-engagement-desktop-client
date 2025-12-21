import { PromotedEngagement } from '../engagement_promotion/types';
import { BaseAction, EngagementChannel, EngagementActionPlan } from './types';

export class ActionPlanBuilder {
    static build(
        engagement: PromotedEngagement,
        action: BaseAction,
        channel: EngagementChannel,
        template: { id: string; text: string }
    ): EngagementActionPlan {

        const requiresApproval = true; // Phase 17F: Always required.

        return {
            action_type: action,
            channel: channel,
            priority: engagement.priority_score,
            template_id: template.id,
            draft_message: template.text, // Simplified, no placeholders logic yet
            requires_human_approval: requiresApproval,
            reasoning: {
                opportunity_summary: engagement.signal.opportunity.explanation.summary,
                buying_stage: engagement.signal.opportunity.buying_stage,
                urgency_score: engagement.signal.opportunity.urgency_score,
                promotion_reason: engagement.promotion_reason
            }
        };
    }
}
