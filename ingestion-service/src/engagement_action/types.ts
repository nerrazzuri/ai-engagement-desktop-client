
export type BaseAction = 'PUBLIC_REPLY' | 'DM' | 'ESCALATE' | 'NO_ACTION';
export type EngagementChannel = 'COMMENT' | 'DM' | 'INTERNAL';

export interface EngagementActionPlan {
    action_type: BaseAction;
    channel: EngagementChannel;
    priority: number;
    template_id?: string;
    draft_message?: string;
    requires_human_approval: boolean;
    reasoning: {
        opportunity_summary: string;
        buying_stage: string;
        urgency_score: number;
        promotion_reason: string;
    };
}
