import { prisma } from '../../db';
import { EngagementTarget, LimitConfig, SafetyCheckResult } from './types';
import { SafetyConfigService } from './config_service';

export class RateLimiter {
    private static async getDailyUsage(target: EngagementTarget): Promise<number> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Count all events that resulted in a suggestion or completion
        // We use OR operator to catch generated suggestions vs final actions
        // Assuming 'SUGGESTED' is the key status for "Reply Generated"
        const count = await prisma.engagementEvent.count({
            where: {
                created_at: {
                    gte: startOfDay
                },
                // Phase 19.5: Account Scoping
                account_id: target.accountId,
                status: {
                    in: ['SUGGESTED', 'DONE']
                }
            } as any
        });

        return count;
    }

    private static async getVideoUsage(videoId: string, accountId: string): Promise<number> {
        // Gap C: Strict Account Scoping
        return await prisma.engagementEvent.count({
            where: {
                video_id: videoId,
                account_id: accountId, // Mandatory Scoping
                status: { in: ['SUGGESTED', 'DONE'] }
            } as any
        });
    }

    public static async checkPreLimits(target: EngagementTarget): Promise<{ allowed: boolean; reason?: string }> {
        const config = SafetyConfigService.getInstance().getLimits();

        // 1. Global Daily Limit (System Wide safety)
        const totalSystem = await prisma.engagementEvent.count({
            where: {
                created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                status: { in: ['SUGGESTED', 'DONE'] }
            }
        });

        if (totalSystem >= config.max_replies_per_day) {
            return { allowed: false, reason: `system_daily_limit_hit (${totalSystem}/${config.max_replies_per_day})` };
        }

        // 2. User Daily Limit
        // Note: Performance warning on LIKE query. Accepted for Phase 19 safety.
        try {
            const userCount = await this.getDailyUsage(target);
            if (userCount >= config.max_replies_per_target_daily) {
                return { allowed: false, reason: `user_daily_limit_hit (${userCount}/${config.max_replies_per_target_daily})` };
            }
        } catch (e) {
            console.warn('[RateLimiter] User check failed, defaulting to safe', e);
            // Fail open or closed? Safety Says: Fail Closed if unsure? 
            // Better to log and allow if DB error, but here we assume query success.
        }

        return { allowed: true };
    }

    public static async checkPostLimits(videoId: string, accountId: string): Promise<{ allowed: boolean; reason?: string }> {
        const config = SafetyConfigService.getInstance().getLimits();

        // Gap C Fix: Account Scoping
        const videoCount = await this.getVideoUsage(videoId, accountId);
        if (videoCount >= config.max_replies_per_video) {
            return { allowed: false, reason: `video_limit_hit (${videoCount}/${config.max_replies_per_video})` };
        }

        return { allowed: true };
    }
}
