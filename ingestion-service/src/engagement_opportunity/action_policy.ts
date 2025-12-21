import { BuyingStage, OpportunityLevel, RecommendedAction } from './types';
import * as policyConfig from './config/action_policy.json';

export class ActionPolicyEngine {
    private static readonly POLICY: Record<string, Record<string, string>> = policyConfig;

    static determineAction(level: OpportunityLevel, stage: BuyingStage): RecommendedAction {
        const stageMap = this.POLICY[level];
        if (!stageMap) return 'IGNORE';

        const action = stageMap[stage];
        // Cast string to RecommendedAction, strictly typed in config but loose here
        return (action as RecommendedAction) || 'IGNORE';
    }
}
