
import { prisma } from '../../db';

export class ValueService {

    static async getAnalytics(workspaceId: string) {
        const totalSuggestions = await prisma.suggestion.count({
            where: { workspace_id: workspaceId }
        });

        const manualPosts = await prisma.suggestionDecision.count({
            where: {
                workspace_id: workspaceId,
                decision: 'POSTED_MANUALLY'
            }
        });

        const pendingReviews = await prisma.suggestion.count({
            where: {
                workspace_id: workspaceId,
                status: 'PENDING'
            }
        });

        // Optional: Get 'ANSWER' strategy count for Strategy breakdown
        const answerStrategy = await prisma.suggestion.count({
            where: {
                workspace_id: workspaceId,
                strategy: 'ANSWER'
            }
        });

        return {
            total_suggestions: totalSuggestions,
            manual_posts: manualPosts,
            pending_reviews: pendingReviews,
            answer_strategy_count: answerStrategy
        };
    }
}
