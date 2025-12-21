
import { prisma } from '../../db';
import { OwnerSettings } from '@prisma/client';

export class BusinessLimitsService {

    /**
     * Check if workspace has exceeded its caps.
     * Returns true if CAP HIT (block/downgrade).
     */
    static async checkCaps(workspaceId: string, settings: OwnerSettings, videoId: string): Promise<{
        capped: boolean;
        reason?: string;
    }> {
        // 1. Daily Cap
        // Ideally utilize a rolling window or daily reset bucket.
        // For Phase 20 MVP, we count created SuggestionSessions for today.
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const dailyCount = await prisma.suggestionSession.count({
            where: {
                event: { account_id: workspaceId }, // Assuming event has account_id context
                created_at: { gte: todayStart }
            }
        });

        if (dailyCount >= settings.max_suggestions_per_day) {
            return { capped: true, reason: 'DAILY_CAP_EXCEEDED' };
        }

        // 2. Per-Video Cap
        const videoCount = await prisma.engagementEvent.count({
            where: {
                account_id: workspaceId,
                video_id: videoId,
                status: 'SUGGESTED' // Count only suggested items
            }
        });

        if (videoCount >= settings.max_suggestions_per_video) {
            return { capped: true, reason: 'VIDEO_CAP_EXCEEDED' };
        }

        return { capped: false };
    }
}
