
import { prisma } from '../../db';
import { ProductDef, PlanId } from './product_def';

export type LimitMetric = 'events_per_day' | 'suggestions_per_day' | 'team_members';

export class ProductLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProductLimitError';
    }
}

export class PlanEnforcer {

    /**
     * Enforce a hard limit based on the workspace's plan.
     * Throws ProductLimitError if limit exceeded.
     */
    static async checkLimit(workspaceId: string, metric: LimitMetric, currentAmount: number = 0): Promise<void> {
        // 1. Fetch Plan ID
        const account = await prisma.account.findUnique({
            where: { id: workspaceId },
            select: { plan_id: true }
        });

        if (!account) throw new Error(`Account ${workspaceId} not found`);

        // 2. Get Limits
        // Cast string to Enum if Prisma returns string (it might if using SQLite provider)
        // But we import PlanId from @prisma/client, so it should match
        const plan = ProductDef.getPlan(account.plan_id as unknown as PlanId);

        let limit = 0;
        let metricName = '';

        switch (metric) {
            case 'events_per_day':
                limit = plan.limits.max_events_per_day;
                metricName = 'Daily Events';
                break;
            case 'suggestions_per_day':
                limit = plan.limits.max_suggestions_per_day;
                metricName = 'Daily Suggestions';
                break;
            case 'team_members':
                limit = plan.limits.max_team_members;
                metricName = 'Team Members';
                break;
        }

        // 3. Enforce
        // Check if ADDING 1 would exceed? Or if CURRENT is already >= limit?
        // Usually we check BEFORE adding.
        // If usage (existing count) >= limit, then we cannot add more.
        console.log(`[PlanEnforcer] Checking ${metric}: Count=${currentAmount}, Limit=${limit}, Plan=${account.plan_id}`);
        if (currentAmount >= limit) {
            throw new ProductLimitError(
                `Plan Limit Exceeded: ${metricName} (Limit: ${limit}, Current: ${currentAmount}). Upgrade plan to increase capacity.`
            );
        }
    }

    /**
     * Check if automation is eligible
     */
    static async isAutomationEligible(workspaceId: string): Promise<boolean> {
        const account = await prisma.account.findUnique({
            where: { id: workspaceId },
            select: { plan_id: true }
        });
        if (!account) return false;

        const plan = ProductDef.getPlan(account.plan_id as PlanId);
        return plan.limits.automation_eligible;
    }
}
