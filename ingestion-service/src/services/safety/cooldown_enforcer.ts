import { prisma } from '../../db';
import { EngagementTarget } from './types';
import { SafetyConfigService } from './config_service';

export class CooldownEnforcer {

    public static async checkCooldown(target: EngagementTarget): Promise<{ allowed: boolean; reason?: string }> {
        const config = SafetyConfigService.getInstance().getLimits();

        // Find the most recent interaction with this user
        // Using same 'metadata contains' strategy
        const lastInteraction = await prisma.engagementEvent.findFirst({
            where: {
                status: { in: ['SUGGESTED', 'DONE'] },
                target_id: target.target_id,
                account_id: target.accountId // Scoped to this account's interactions
            } as any,
            orderBy: {
                created_at: 'desc'
            }
        });

        if (!lastInteraction) {
            return { allowed: true };
        }

        const now = new Date();
        const diffMs = now.getTime() - lastInteraction.created_at.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < config.cooldown_hours) {
            const wait = (config.cooldown_hours - diffHours).toFixed(1);
            return { allowed: false, reason: `cooldown_active (wait ${wait}h)` };
        }

        return { allowed: true };
    }
}
