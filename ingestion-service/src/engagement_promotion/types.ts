import { EngagementOpportunity, RecommendedAction } from '../engagement_opportunity/types';

export interface EngagementSignal {
    opportunity: EngagementOpportunity;
    metadata: {
        comment_id: string;
        video_id: string;
        user_id?: string; // Optional (e.g. unknown user)
        timestamp: string; // ISO string
        platform: string;
    };
}

export interface AggregationContext {
    repeated_user: boolean;
    repeated_video: boolean;
    intent_escalation: boolean;
    frequency_score: number;
    related_signals_count: number;
}

export interface PromotedEngagement {
    opportunity_id: string;
    priority_score: number;
    promotion_reason: string;
    recommended_action: RecommendedAction;
    aggregation_context: AggregationContext;
    status: 'PROMOTED' | 'DEFERRED' | 'SUPPRESSED';
    signal: EngagementSignal; // Original signal
}
