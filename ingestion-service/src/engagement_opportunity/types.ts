import { EngagementIntent } from '../services/brain/types';

export type OpportunityLevel = 'IGNORE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BuyingStage = 'AWARENESS' | 'CONSIDERATION' | 'VALIDATION' | 'DECISION' | 'REGRET';
export type RecommendedAction = 'IGNORE' | 'PUBLIC_REPLY' | 'DM' | 'ESCALATE';

export interface EngagementOpportunity {
    opportunity_level: OpportunityLevel;
    buying_stage: BuyingStage;
    urgency_score: number; // 0-100
    primary_intent: EngagementIntent;
    supporting_intents: EngagementIntent[];
    recommended_action: RecommendedAction;
    explanation: {
        summary: string;
        signals: string[];
        matched_phrases: string[];
    };
}
