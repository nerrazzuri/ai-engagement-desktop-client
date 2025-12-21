import { PromotedEngagement } from '../engagement_promotion/types';
import { EngagementActionPlan } from './types';
import { ActionRouter } from './action_router';
import { ChannelConstraints } from './channel_constraints';
import { TemplateSelector } from './template_selector';
import { ActionPlanBuilder } from './action_plan_builder';

export class ActionOrchestrator {
    static createPlan(engagement: PromotedEngagement): EngagementActionPlan {
        if (!engagement) throw new Error('Engagement required');

        // 1. Route Action
        const baseAction = ActionRouter.route(engagement);

        // 2. Apply Platform Constraints
        const platform = engagement.signal.metadata.platform;
        const constrained = ChannelConstraints.apply(baseAction, platform);

        // 3. Select Template
        // Only select template if action involves sending a message (Reply/DM)
        // Escalation might have a template too (internal note), NO_ACTION doesn't.
        let template = { id: 'none', text: '' };
        if (['PUBLIC_REPLY', 'DM', 'ESCALATE'].includes(constrained.action)) {
            template = TemplateSelector.select(engagement);
        }

        // 4. Build Plan
        return ActionPlanBuilder.build(
            engagement,
            constrained.action,
            constrained.channel,
            template
        );
    }
}
