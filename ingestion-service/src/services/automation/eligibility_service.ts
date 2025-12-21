
import { prisma } from '../../db';
import { ProductDef, PlanId } from '../product/product_def';
import { AutomationPolicy } from './automation_policy';
import { Suggestion, OwnerSettings } from '@prisma/client';

export interface AutomationEligibilityDecision {
    allowed: boolean;
    reasons: string[];
    constraints: {
        max_replies_per_day: number;
        allowed_time_window: string;
    };
    checked_at: Date;
}

export class AutomationEligibilityService {

    /**
     * Evaluate eligibility for a given suggestion, persist decision, and return it.
     */
    static async evaluate(suggestionId: string): Promise<AutomationEligibilityDecision> {
        const suggestion = await prisma.suggestion.findUnique({
            where: { id: suggestionId },
            include: { account: { include: { owner_settings: true } } }
        });

        if (!suggestion || !suggestion.account) {
            throw new Error(`Suggestion or Account not found: ${suggestionId}`);
        }

        console.log(`[Eligibility] Evaluating ${suggestionId}. Plan: ${suggestion.account.plan_id}, OptIn: ${suggestion.account.owner_settings?.automation_opt_in}`);

        const decision = await this.computeDecision(suggestion, suggestion.account, suggestion.account.owner_settings);

        // PERSISTENCE
        await prisma.suggestion.update({
            where: { id: suggestionId },
            data: {
                automation_eligible: decision.allowed,
                automation_reasons: JSON.stringify(decision.reasons),
                automation_checked_at: decision.checked_at
            }
        });

        return decision;
    }

    /**
     * Internal PURE logic (unit testable without DB side effects if needed)
     */
    private static async computeDecision(suggestion: Suggestion, account: any, settings: OwnerSettings | null): Promise<AutomationEligibilityDecision> {
        const reasons: string[] = [];
        const plan = ProductDef.getPlan(account.plan_id as PlanId);

        // 1. GATE: Plan Constraints
        if (!plan.limits.automation_eligible) {
            reasons.push(`Plan '${plan.name}' does not support automation.`);
        }

        // 2. GATE: Owner Opt-In
        if (!settings || !settings.automation_opt_in) {
            reasons.push('Automation is not enabled in Owner Settings.');
        }

        // 3. GATE: Context Safety
        // Must be OWNED_CONTENT and OWNER role (or equivalent safe combination)
        const isSafeContext = suggestion.context_type === 'OWNED_CONTENT' && suggestion.speaker_role === 'OWNER';
        if (!isSafeContext) {
            reasons.push(`Unsafe Context: ${suggestion.context_type}/${suggestion.speaker_role}. Only OWNED_CONTENT/OWNER is allowed.`);
        }

        // 4. GATE: Confidence
        if (suggestion.confidence < AutomationPolicy.MIN_CONFIDENCE_THRESHOLD) {
            reasons.push(`Confidence ${suggestion.confidence.toFixed(2)} is below threshold ${AutomationPolicy.MIN_CONFIDENCE_THRESHOLD}.`);
        }

        // 5. GATE: Trust Signals (History)
        // Check Approved Count
        const approvedCount = await prisma.suggestionDecision.count({
            where: {
                workspace_id: account.id,
                decision: 'APPROVE'
            }
        });

        if (approvedCount < AutomationPolicy.MIN_APPROVED_SUGGESTIONS) {
            reasons.push(`Insufficient history: ${approvedCount}/${AutomationPolicy.MIN_APPROVED_SUGGESTIONS} approved suggestions.`);
        }

        // Check Recent Rejections (Last 7 days)
        const historyWindow = new Date();
        historyWindow.setDate(historyWindow.getDate() - AutomationPolicy.HISTORY_WINDOW_DAYS);

        const recentRejections = await prisma.suggestionDecision.count({
            where: {
                workspace_id: account.id,
                decision: 'REJECT',
                created_at: { gte: historyWindow }
            }
        });

        if (recentRejections > AutomationPolicy.MAX_RECENT_REJECTIONS) {
            reasons.push(`Too many recent rejections: ${recentRejections} in last ${AutomationPolicy.HISTORY_WINDOW_DAYS} days.`);
        }

        // FINAL DECISION
        const allowed = reasons.length === 0;

        return {
            allowed,
            reasons,
            constraints: {
                max_replies_per_day: AutomationPolicy.DEFAULT_DAILY_LIMIT,
                allowed_time_window: AutomationPolicy.DEFAULT_TIME_WINDOW
            },
            checked_at: new Date()
        };
    }
}
