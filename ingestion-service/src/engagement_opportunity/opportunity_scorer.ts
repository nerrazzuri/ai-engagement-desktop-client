import { EngagementIntent } from '../services/brain/types';
import { OpportunityLevel } from './types';
import * as weightsConfig from './config/intent_weights.json';

export class OpportunityScorer {
    private static readonly WEIGHTS: Record<string, number> = weightsConfig;

    static score(primaryIntent: EngagementIntent, normalizedText: string): { score: number; level: OpportunityLevel; signals: string[] } {
        let score = this.WEIGHTS[primaryIntent] || 0;
        const signals: string[] = [`Base(${primaryIntent}): ${score}`];

        // Modifiers
        // 1. Comparison Language (+10)
        if (['better than', 'compared to', 'versus', 'vs'].some(s => normalizedText.includes(s))) {
            score += 10;
            signals.push('Modifier: Comparison (+10)');
        }

        // 2. Urgency (+15)
        if (['asap', 'now', 'urgently', 'need', 'fast'].some(s => normalizedText.includes(s))) {
            score += 15;
            signals.push('Modifier: Urgency (+15)');
        }

        // 3. Hesitation (-10)
        if (['maybe', 'unsure', 'depends', 'might'].some(s => normalizedText.includes(s))) {
            score -= 10;
            signals.push('Modifier: Hesitation (-10)');
        }

        // Clamp 0-100
        score = Math.max(0, Math.min(100, score));

        // Map to Level
        let level: OpportunityLevel = 'IGNORE';
        if (score > 80) level = 'CRITICAL';
        else if (score > 60) level = 'HIGH';
        else if (score > 40) level = 'MEDIUM';
        else if (score > 20) level = 'LOW';

        return { score, level, signals };
    }
}
