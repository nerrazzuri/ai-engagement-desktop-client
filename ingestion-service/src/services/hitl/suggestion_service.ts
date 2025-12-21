
import { prisma } from '../../db';
import { Suggestion, SuggestionDecision, Prisma } from '@prisma/client';
// import { SuggestionStatus } from './suggestion_service';
// But importing from './suggestion_service' is circular if this IS the file.
// The file exports SuggestionStatus. Correct.
// But valid typescript allows using the Enum defined in the same file directly.

import { PlanEnforcer } from '../product/plan_enforcer';
import { OnboardingService, OnboardingState } from '../product/onboarding_service';

export enum SuggestionStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    EDITED = 'EDITED',
    EXPIRED = 'EXPIRED'
}

export interface CreateSuggestionParams {
    workspaceId: string;
    eventId: string;
    platform: string;
    videoId: string;
    commentId?: string;
    text: string;
    strategy: string;
    confidence: number;
    signals: string; // JSON
    ownerSettingsSnapshot: string; // JSON
    // Phase 23
    contextType?: string;
    speakerRole?: string;
    templateCategory?: string;
}

export class SuggestionService {

    /**
     * Create a new pending suggestion.
     */
    static async createSuggestion(params: CreateSuggestionParams): Promise<Suggestion> {
        console.log('[SuggestionService] createSuggestion called');
        // Phase 24: Enforce Plan Limits
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const dailyCount = await prisma.suggestion.count({
            where: {
                workspace_id: params.workspaceId,
                created_at: { gte: startOfDay }
            }
        });

        await PlanEnforcer.checkLimit(params.workspaceId, 'suggestions_per_day', dailyCount);

        // Calculate expiry (Default 24h)
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const suggestion = await prisma.suggestion.create({
            data: {
                workspace_id: params.workspaceId,
                event_id: params.eventId,
                platform: params.platform,
                video_id: params.videoId,
                comment_id: params.commentId,
                suggested_text: params.text,
                strategy: params.strategy,
                confidence: params.confidence,
                signals: params.signals,
                owner_settings_snapshot: params.ownerSettingsSnapshot,
                status: SuggestionStatus.PENDING,
                expires_at: expiresAt,
                // Phase 23: Context & Safety
                context_type: params.contextType,
                speaker_role: params.speakerRole,
                template_category: params.templateCategory
            }
        });

        // Phase 24: Onboarding Trigger
        await OnboardingService.advance(params.workspaceId, OnboardingState.FIRST_SUGGESTION_CREATED);

        return suggestion;
    }

    /**
     * List suggestions for a workspace.
     */
    static async listSuggestions(workspaceId: string, status?: string): Promise<Suggestion[]> {
        const where: Prisma.SuggestionWhereInput = {
            workspace_id: workspaceId
        };
        if (status) {
            where.status = status;
        }

        return await prisma.suggestion.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 50 // Cap for now
        });
    }

    /**
     * Get details with Explainability.
     */
    static async getSuggestionDetail(workspaceId: string, suggestionId: string) {
        const suggestion = await prisma.suggestion.findUnique({
            where: { id: suggestionId }
        });

        if (!suggestion || suggestion.workspace_id !== workspaceId) {
            throw new Error('Suggestion not found or access denied');
        }

        // Construct Explainability
        const explanation = await this.generateExplainability(suggestion);

        return {
            ...suggestion,
            explanation
        };
    }

    private static async generateExplainability(suggestion: Suggestion) {
        // Deterministic generation based on snapshot data
        const signals = JSON.parse(suggestion.signals);
        const settings = JSON.parse(suggestion.owner_settings_snapshot);

        // Extract intent from signals or settings?
        // Usually signals contains detected intent info if we stored it
        // Phase 20: BrainInput has intent_context.
        // We should store intent in signals or dedicated field? 
        // For now, assume signals has it.

        let detectedIntent = 'Unknown';
        // Mock parsing logic or assume signals structure

        const keyPhrases = [];
        // In real app, extract from signals

        return {
            detected_intent: detectedIntent,
            confidence_score: suggestion.confidence,
            owner_settings_applied: {
                mode: settings.mode,
                aggressiveness: settings.aggressiveness
            },
            summary: `This suggestion was generated because the system detected relevant intent with ${suggestion.confidence.toFixed(2)} confidence. Owner mode '${settings.mode}' permitted this suggestion.`
        };
    }

    /**
     * Approve a suggestion.
     */
    static async approveSuggestion(workspaceId: string, userId: string, suggestionId: string, note?: string) {
        // [SQLite Workaround] Removed transaction to avoid locking timeouts on dev env.
        // In Prod (Postgres), wrap in $transaction.
        const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
        if (!suggestion || suggestion.workspace_id !== workspaceId) throw new Error('Not found');
        if (suggestion.status !== SuggestionStatus.PENDING) throw new Error(`Cannot approve ${suggestion.status} suggestion`);
        if (suggestion.expires_at && suggestion.expires_at < new Date()) throw new Error('Suggestion expired');

        // Update Status
        const updated = await prisma.suggestion.update({
            where: { id: suggestionId },
            data: { status: SuggestionStatus.APPROVED }
        });

        // Log Decision
        await prisma.suggestionDecision.create({
            data: {
                suggestion_id: suggestionId,
                workspace_id: workspaceId,
                user_id: userId,
                decision: 'APPROVE',
                reason: note
            }
        });

        // Phase 24: Onboarding Trigger
        await OnboardingService.advance(workspaceId, OnboardingState.FIRST_DECISION_MADE);

        return updated;
    }

    /**
     * Reject a suggestion.
     */
    static async rejectSuggestion(workspaceId: string, userId: string, suggestionId: string, reason?: string) {
        const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
        if (!suggestion || suggestion.workspace_id !== workspaceId) throw new Error('Not found');
        if (suggestion.status !== SuggestionStatus.PENDING) throw new Error(`Cannot reject ${suggestion.status} suggestion`);

        const updated = await prisma.suggestion.update({
            where: { id: suggestionId },
            data: { status: SuggestionStatus.REJECTED }
        });

        await prisma.suggestionDecision.create({
            data: {
                suggestion_id: suggestionId,
                workspace_id: workspaceId,
                user_id: userId,
                decision: 'REJECT',
                reason: reason
            }
        });

        // Phase 24: Onboarding Trigger
        await OnboardingService.advance(workspaceId, OnboardingState.FIRST_DECISION_MADE);

        return updated;
    }

    /**
     * Edit and Approve a suggestion.
     */
    static async editSuggestion(workspaceId: string, userId: string, suggestionId: string, finalText: string, note?: string) {
        const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
        if (!suggestion || suggestion.workspace_id !== workspaceId) throw new Error('Not found');
        if (suggestion.status !== SuggestionStatus.PENDING) throw new Error(`Cannot edit ${suggestion.status} suggestion`);
        if (suggestion.expires_at && suggestion.expires_at < new Date()) throw new Error('Suggestion expired');

        const updated = await prisma.suggestion.update({
            where: { id: suggestionId },
            data: {
                status: SuggestionStatus.EDITED,
                suggested_text: finalText
            }
        });

        await prisma.suggestionDecision.create({
            data: {
                suggestion_id: suggestionId,
                workspace_id: workspaceId,
                user_id: userId,
                decision: 'EDIT',
                final_text: finalText,
                reason: note
            }
        });

        // Phase 24: Onboarding Trigger
        await OnboardingService.advance(workspaceId, OnboardingState.FIRST_DECISION_MADE);

        return updated;
    }
}
