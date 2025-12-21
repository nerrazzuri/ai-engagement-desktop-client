import { EngagementIntent } from '../services/brain/types';
import { BuyingStage } from './types';
import * as mapConfig from './config/buying_stage_map.json';

export class BuyingStageMapper {
    private static readonly MAPPING: Record<string, BuyingStage> = mapConfig as any;

    static map(primaryIntent: EngagementIntent, supportingIntents: EngagementIntent[] = []): BuyingStage {
        // Rule 1: Regret always overrides
        if (primaryIntent === 'POST_PURCHASE_REGRET' || supportingIntents.includes('POST_PURCHASE_REGRET')) {
            return 'REGRET';
        }

        // Rule 2: Hostile overrides (treated as Regret stage for mitigation)
        if (primaryIntent === 'HOSTILE' || supportingIntents.includes('HOSTILE')) {
            return 'REGRET';
        }

        // Rule 3: Use Primary Intent mapping
        const stage = this.MAPPING[primaryIntent];
        if (stage) return stage;

        // Default
        return 'AWARENESS';
    }
}
