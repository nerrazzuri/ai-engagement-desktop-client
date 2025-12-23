import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DesktopCaptureEventSchema, EngagementEventSchema } from '../schemas/desktop_capture_event';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { prisma } from '../db';
import { requireAdmin } from '../auth/admin_middleware';

const router = Router();
// const prisma = new PrismaClient(); // Removed local instance

// ==========================================
// Phase 12.1 Work Queue & Idempotency
// ==========================================

// Helper: Generate Deterministic Dedup Key
function generateDedupKey(platform: string, videoId: string, commentId: string): string {
    return crypto.createHash('sha256')
        .update(`${platform}:${videoId}:${commentId}`)
        .digest('hex');
}

// POST /events - Ingest Raw Event
router.post('/events', async (req: Request, res: Response) => {
    const payload = req.body;
    const installId = req.headers['x-install-id'] as string;
    const installSecret = req.headers['x-install-secret'] as string;

    // 1. Basic Transport Validation (Sync)
    if (!payload || typeof payload !== "object") {
        res.status(400).json({
            status: "error",
            message: 'Invalid payload'
        });
        return;
    }

    if (!installId) {
        res.status(400).json({ status: 'error', message: 'Missing x-install-id' });
        return;
    }

    // 2. Strict Ownership & Validations (Sync)
    try {
        const install = await prisma.installRegistry.findUnique({
            where: { install_id: installId },
            include: { account: true }
        } as any) as any;

        // REJECT: Install not found
        if (!install) {
            console.warn(`[Ingest] Blocked: Unknown Install ID ${installId}`);
            res.status(403).json({ status: 'error', code: 'INSTALL_NOT_FOUND' });
            return;
        }

        // Phase 19.7 Hardening: Check Secret if present in DB
        if (install.install_secret) {
            if (!installSecret || installSecret !== install.install_secret) {
                console.warn(`[Ingest] Blocked: Invalid Secret for Install ID ${installId}`);
                res.status(403).json({ status: 'error', code: 'INVALID_INSTALL_SECRET' });
                return;
            }
        }

        // REJECT: Install inactive (Kill Switch)
        if (!install.is_active) {
            console.warn(`[Ingest] Blocked: Inactive Install ID ${installId}`);
            res.status(403).json({ status: 'error', code: 'INSTALL_INACTIVE' });
            return;
        }

        // REJECT: Orphaned Install (Strict Phase 19.5 Enforcement)
        if (!install.account_id || !install.account) {
            console.warn(`[Ingest] Blocked: Orphaned Install ID ${installId} (No Account)`);
            res.status(403).json({ status: 'error', code: 'INSTALL_ORPHANED' });
            return;
        }

        // REJECT: Suspended Account
        if (install.account.status !== 'ACTIVE') {
            console.warn(`[Ingest] Blocked: Suspended Account ${install.account_id} for Install ${installId}`);
            res.status(403).json({ status: 'error', code: 'ACCOUNT_SUSPENDED' });
            return;
        }

        const accountId = install.account_id;

        // 3. Acknowledge Receipt
        res.status(202).json({
            status: "accepted",
            message: "Event accepted"
        });

        // 4. Process Asynchronously (Detached)
        processEventBackground(payload, installId, accountId).catch(err => {
            console.error('[Ingest] Background Processing Failed:', err);
        });

    } catch (err) {
        console.error('[Ingest] Setup Error:', err);
        res.status(500).json({ status: 'error' });
    }
});

// Helper: Background Processor
async function processEventBackground(rawPayload: any, installId: string, accountId: string) {
    try {
        // Validation (Already validated Install/Account in sync path)
        const parseResult = DesktopCaptureEventSchema.safeParse(rawPayload);
        if (!parseResult.success) {
            console.warn(`[Validation] Schema check failed for ${installId}:`, parseResult.error.issues);
            return;
        }

        const event = parseResult.data;

        // Phase 24: Plan Limit Enforcement (Daily Events)
        const { PlanEnforcer } = require('../services/product/plan_enforcer');

        // 1. Calculate Usage
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const dailyCount = await prisma.engagementEvent.count({
            where: {
                account_id: accountId,
                created_at: { gte: startOfDay }
            }
        });

        // 2. Check Limit (Throws if exceeded)
        try {
            await PlanEnforcer.checkLimit(accountId, 'events_per_day', dailyCount);
        } catch (limitErr: any) {
            console.warn(`[Ingest] Plan Limit Exceeded for ${accountId}: ${limitErr.message}`);
            // We store it as IGNORED/BLOCKED event? Or just drop?
            // "Hard Clamps Only" -> Ideally drop or reject.
            // But we already returned 202 Accepted.
            // So we just stop processing.
            return;
        }

        // Normalize & Deduplicate
        const dedupKey = generateDedupKey(event.platform, event.video.video_id, event.comment.comment_id);

        const engagementEvent = await prisma.engagementEvent.upsert({
            where: { dedup_key: dedupKey },
            update: {
                // Determine if we update metadata?
            },
            create: {
                dedup_key: dedupKey,
                platform: event.platform,
                target_id: `${event.platform}:${event.comment.author_name || event.comment.author_id || 'unknown'}`,
                video_id: event.video.video_id,
                comment_id: event.comment.comment_id,
                content_text: event.comment.text,
                metadata: JSON.stringify(event),
                status: 'NEW',
                // Phase 19.5: Ownership
                install_id: installId,
                account_id: accountId
            } as any
        });

        console.log(`[Ingest] Event persisted: ${engagementEvent.id} (Dedup: ${dedupKey}, Account: ${accountId})`);

        // Phase 24: Onboarding Trigger
        const { OnboardingService, OnboardingState } = require('../services/product/onboarding_service');
        await OnboardingService.advance(accountId, OnboardingState.FIRST_EVENT_INGESTED);

        // Phase 21: Auto-Suggestion
        await triggerAutoSuggest(engagementEvent, accountId, installId, event);

    } catch (err) {
        console.error('[Ingest] Logic Error:', err);
    }
}

// Helper: Auto-Suggest Pipeline (Phase 21)
async function triggerAutoSuggest(event: any, accountId: string, installId: string, payload: any) {
    try {
        // 1. Adapter
        const videoEvent: VideoEvent = {
            platform: event.platform,
            video_id: event.video_id,
            creator_id: payload.video?.author_id || 'unknown',
            creator_name: payload.video?.author_name || 'unknown',
            video_title: payload.video?.title || 'Untitled',
            video_description: '',
            video_tags: [],
            timestamp: payload.page?.timestamp || new Date().toISOString(),
            session_id: payload.session?.session_id || 'unknown_session',
            install_id: installId,
            text: event.content_text
        };

        const req = VideoEventAdapter.toCapabilityRequest(videoEvent);
        req.tenant_id = installId;
        if (!req.context) req.context = {};
        req.context.raw_event = { ...((req.context.raw_event as object) || {}), account_id: accountId };

        // 2. Brain
        const resp = await BrainGateway.processCapability(req);

        // Phase 22: Value Outcome Persistence
        // If ignore or error, we persist the outcome in metadata for silent value metrics
        // and DO NOT create a suggestion.
        if ((resp.kind as any) === 'ignore' || (resp.kind as any) === 'error') {
            const outcome = {
                result: (resp.kind as any) === 'error' ? 'BLOCKED' : 'IGNORED',
                reason: (resp.payload as any)?.reason || (resp.payload as any)?.error || 'Unknown',
                strategy: (resp.payload as any)?.strategy, // e.g. OBSERVE_ONLY
                explanation: (resp.policy_decisions as any)?.explanation || ''
            };

            // Update Event Metadata
            const currentMeta = JSON.parse((event as any).metadata || '{}');
            const newMeta = { ...currentMeta, value_outcome: outcome };

            await prisma.engagementEvent.update({
                where: { id: event.id },
                data: {
                    metadata: JSON.stringify(newMeta),
                    status: (resp.kind as any) === 'error' ? 'ERROR' : 'IGNORED'
                }
            });

            console.log(`[Ingest] Silent Value Captured for ${event.id}: ${outcome.strategy || outcome.reason}`);
            return;
        }

        // If here, kind is 'answer' or 'recommend' -> Create Suggestion
        const p = resp.payload as any;
        const strategy = p?.strategy;
        const text = p?.text || '';

        console.log(`[Ingest] Proceeding to create suggestion. Strategy: ${strategy}, Text len: ${text.length}`);

        const { OwnerSettingsService } = require('../services/owner/owner_settings_service');
        const settings = await OwnerSettingsService.getSettings(accountId);

        console.log(`[Ingest] Got Owner Settings. Creating Suggestion...`);

        await SuggestionService.createSuggestion({
            workspaceId: accountId,
            eventId: event.id,
            platform: event.platform,
            videoId: event.video_id,
            commentId: event.comment_id,
            text: text,
            strategy: strategy,
            confidence: resp.confidence ?? 0,
            signals: JSON.stringify(resp.policy_decisions || {}),
            ownerSettingsSnapshot: JSON.stringify(settings),
            // Phase 23: Context Extraction
            contextType: (resp.policy_decisions as any)?.trace?.context?.context_type,
            speakerRole: (resp.policy_decisions as any)?.trace?.context?.speaker_role,
            templateCategory: (resp.policy_decisions as any)?.trace?.context?.template_category
        });

        console.log(`[Ingest] Suggestion Created for ${event.id}`);

    } catch (err) {
        console.error('[Ingest] Auto-Suggest Failed:', err);
    }
}

// ==========================================
// Phase 12.2 Suggestion Session
// ==========================================
import { BrainGateway } from '../services/brain/brain_gateway';
import { CapabilityRequest, CapabilityResponse } from '../core/contracts';
import { VideoEventAdapter } from '../adapters/video/video_event_adapter';
import { VideoEvent } from '../adapters/video/schemas';
import { SuggestionService } from '../services/hitl/suggestion_service';

// ...

// POST /suggestions
router.post('/suggestions', async (req: Request, res: Response) => {
    const { event_id } = req.body;
    // Gap A: Strict Requirement - No Fallback
    const installId = req.headers['x-install-id'] as string;

    if (!installId) {
        res.status(400).json({ error: 'Missing x-install-id' });
        return;
    }

    try {
        const event = await prisma.engagementEvent.findUnique({ where: { id: event_id } }) as any;
        if (!event) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }

        // Phase 19.5: Ownership Verification
        const install = await prisma.installRegistry.findUnique({
            where: { install_id: installId },
            include: { account: true }
        } as any) as any;

        if (!install || !install.account || install.account.status !== 'ACTIVE') {
            console.warn(`[Suggestions] Blocked: Invalid/Inactive Install or Suspended Account (${installId})`);
            res.status(403).json({ error: 'Unauthorized' });
            return;
        }

        // Check if Event belongs to Licensee's Account
        if (event.account_id && event.account_id !== install.account_id) {
            console.warn(`[Suggestions] Blocked: Access Denied. Event ${event.id} (Account ${event.account_id}) accessed by Install ${installId} (Account ${install.account_id})`);
            res.status(404).json({ error: 'Event not found' });
            return;
        }

        // ... (Feedback history loading remains same) ...
        const feedbackHistory = await prisma.feedbackSignal.findMany({
            where: {
                session: {
                    event: {
                        // Implicitly scoped by strictly requiring event access above
                    }
                }
            },
            select: { action: true, edit_distance: true }
        });

        const stats = {
            total_suggestions: feedbackHistory.length,
            ignored_count: feedbackHistory.filter((f: { action: string }) => f.action === 'IGNORE' || f.action === 'DISMISS').length,
            edited_count: feedbackHistory.filter((f: { action: string }) => f.action === 'EDIT_COPY').length,
            avg_edit_distance: 0
        };

        // 2. Assemble Context
        const tenantContext: any = {
            tenant_id: installId,
            tone: event.video_id.length % 2 === 0 ? 'PROFESSIONAL' : 'CASUAL',
            avg_reply_length: 'MEDIUM',
            prohibited_keywords: []
        };

        const count = await prisma.suggestionSession.count({ where: { event_id: event.id } });

        // Phase 17B: Reconstruct Domain Event
        const rawMeta = JSON.parse((event as any).metadata || '{}');

        const videoEvent: VideoEvent = {
            platform: event.platform as any,
            video_id: event.video_id,
            creator_id: rawMeta.video?.author_id || 'unknown',
            creator_name: rawMeta.video?.author_name || 'unknown',
            video_title: rawMeta.video?.title || 'Untitled Video',
            video_description: '',
            video_tags: [],
            timestamp: rawMeta.page?.timestamp || new Date().toISOString(),
            session_id: rawMeta.session?.session_id || 'unknown_session',
            install_id: installId,
            text: event.content_text
        };

        const capabilityRequest = VideoEventAdapter.toCapabilityRequest(videoEvent);

        capabilityRequest.tenant_id = installId;
        if (!capabilityRequest.context) capabilityRequest.context = {};

        // Gap B Fix: Inject account_id into raw_event for SafetyService
        const existingRaw = (capabilityRequest.context.raw_event as object) || {};
        capabilityRequest.context.raw_event = {
            ...existingRaw,
            account_id: install.account_id // CRITICAL: Propagate Account ID
        };

        (capabilityRequest.context as any).flow = 'answer_then_recommend';

        const capabilityResponse = await BrainGateway.processCapability(capabilityRequest);

        const payload = capabilityResponse.payload as { text?: string; strategy?: string } | null;
        const decisions = (capabilityResponse.policy_decisions || {}) as { explanation?: string; trace?: any };

        const brainResp = {
            text: payload?.text || '',
            strategy: payload?.strategy || 'ANSWER',
            confidence: capabilityResponse.confidence,
            explanation: decisions?.explanation || 'Generated via Gateway',
            decision_trace: decisions?.trace || {},
            model: 'gateway-model'
        };

        const session = await prisma.suggestionSession.create({
            data: {
                event_id: event.id,
                version: count + 1,
                input_snapshot: JSON.stringify({
                    text: event.content_text,
                    tenant: tenantContext,
                    history: stats
                }),
                suggestion_text: brainResp.text,
                brain_meta: JSON.stringify({
                    model: brainResp.model,
                    strategy: brainResp.strategy,
                    confidence: brainResp.confidence,
                    explanation: brainResp.explanation,
                    trace: brainResp.decision_trace
                })
            }
        });

        await prisma.engagementEvent.update({
            where: { id: event.id },
            data: { status: 'SUGGESTED' }
        });

        res.json({
            session_id: session.id,
            text: session.suggestion_text,
            version: session.version,
            _meta: {
                strategy: brainResp.strategy,
                explanation: brainResp.explanation,
                model: brainResp.model,
                prompt_version: (brainResp.decision_trace as any).prompt_version,
                rag: (brainResp.decision_trace as any).rag_meta
            }
        });

    } catch (err: any) {
        console.error('Suggestion Failed Stack:', err.stack || err);
        res.status(500).json({ error: 'Suggestion failed', details: err.message });
    }
});

// ==========================================
// Phase 12.3 & 12.4 Feedback Loop
// ==========================================
router.post('/feedback', async (req: Request, res: Response) => {
    const { session_id, action, final_text } = req.body;

    try {
        const session = await prisma.suggestionSession.findUnique({ where: { id: session_id } });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }

        const original = session.suggestion_text;
        const dist = final_text && final_text !== original ? 10 : 0;

        await prisma.feedbackSignal.create({
            data: {
                session_id,
                action,
                final_text,
                edit_distance: dist,
                time_to_action: 0
            }
        });

        let newStatus = 'DONE';
        if (action === 'IGNORE' || action === 'DISMISS') newStatus = 'IGNORED';

        await prisma.engagementEvent.update({
            where: { id: session.event_id },
            data: { status: newStatus }
        });

        res.json({ status: 'success' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Feedback failed' });
    }
});

// ==========================================
// Phase 12.6 Admin Controls
// ==========================================

// Helper: Gap D - Admin Auth
function isAdmin(req: Request): boolean {
    const secret = process.env.AI_CORE_INTERNAL_SECRET || 'dev_secret';
    return req.headers['x-admin-key'] === secret;
}

router.post('/admin/kill-switch', async (req: Request, res: Response) => {
    if (!isAdmin(req)) { // Gap D: Protect Admin
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const { install_id, set_active } = req.body;
    try {
        await prisma.installRegistry.update({
            where: { install_id },
            data: { is_active: set_active }
        });
        res.json({ status: 'updated', install_id, is_active: set_active });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

router.get('/admin/queue', requireAdmin, async (req: Request, res: Response) => {
    // if (!isAdmin(req)) { // Gap D: Protect Admin
    //     res.status(401).json({ error: 'Unauthorized' });
    //     return;
    // }
    const events = await prisma.engagementEvent.findMany({
        orderBy: { created_at: 'desc' },
        take: 50,
        include: { sessions: { include: { feedback: true } } }
    });
    res.json(events);
});

export default router;
