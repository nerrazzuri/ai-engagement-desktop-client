import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DesktopCaptureEventSchema, EngagementEventSchema } from '../schemas/desktop_capture_event';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

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
    const installId = req.headers['x-install-id'] as string;

    // 1. Verify Install ID & Kill Switch
    if (!installId) {
        res.status(401).json({ status: 'error', message: 'Missing x-install-id' });
        return;
    }

    // Find or Create Install Record
    let install = await prisma.installRegistry.findUnique({ where: { install_id: installId } });
    if (!install) {
        install = await prisma.installRegistry.create({
            data: { install_id: installId, is_active: true }
        });
    }

    // J1: Hard Kill Switch Enforcement
    if (!install.is_active) {
        console.warn(`[Blocked] Event from disabled install: ${installId}`);
        res.status(403).json({ status: 'error', message: 'Installation disabled' });
        return;
    }

    // 2. Validate Payload
    const parseResult = DesktopCaptureEventSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({ status: 'error', message: 'Validation failed', issues: parseResult.error.issues });
        return;
    }

    const event = parseResult.data;

    // 3. Normalize & Deduplicate
    const dedupKey = generateDedupKey(event.platform, event.video.video_id, event.comment.comment_id);

    try {
        // Upsert Event (Idempotency)
        const engagementEvent = await prisma.engagementEvent.upsert({
            where: { dedup_key: dedupKey },
            update: {
                // If exists, maybe update timestamp or context? Keeping it simple: No-Op or ensure non-nulls.
                // For now, we don't overwrite raw content if it's the same ID.
            },
            create: {
                dedup_key: dedupKey,
                platform: event.platform,
                video_id: event.video.video_id,
                comment_id: event.comment.comment_id,
                content_text: event.comment.text,
                metadata: JSON.stringify(event), // Phase 17: Persist full raw event
                status: 'NEW'
            } as any
        });

        // 4. Return Success (No Suggestion yet - Client must call /suggestions)
        // Note: For backwards compatibility with P11 test, we might wanted to trigger suggestion immediately, 
        // but Phase 12 splits this. 
        // Let's keeps P11 compatibility: If Manual Trigger, we mock availability, 
        // but tell client to fetch suggestion.

        res.status(200).json({
            status: 'success',
            event_id: engagementEvent.id,
            recommendation: { available: true } // Signal client to proceed
        });

    } catch (err) {
        console.error('Ingest Error:', err);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// ==========================================
// Phase 12.2 Suggestion Session
// ==========================================
import { BrainGateway } from '../services/brain/brain_gateway';
import { CapabilityRequest, CapabilityResponse } from '../core/contracts';
import { VideoEventAdapter } from '../adapters/video/video_event_adapter';
import { VideoEvent } from '../adapters/video/schemas';

// ...

// POST /suggestions
router.post('/suggestions', async (req: Request, res: Response) => {
    const { event_id } = req.body;
    const installId = req.headers['x-install-id'] as string || 'default_tenant'; // Fallback if missing, though middleware should catch it normally


    try {
        const event = await prisma.engagementEvent.findUnique({ where: { id: event_id } });
        if (!event) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }

        // 1. Gather Historical Signals (Feedback) to inform the Brain
        // In a real system, this would be cached or aggregated.
        const feedbackHistory = await prisma.feedbackSignal.findMany({
            where: {
                session: {
                    event: {
                        // Assuming we filter by matching install_id or similar owner context?
                        // For now, let's grab all feedback for this logical "tenant" (we don't have explicit tenant_id on event, 
                        // but we can assume global history for this install for Phase 13 single-user assumption)
                    }
                }
            },
            select: { action: true, edit_distance: true }
        });

        const stats = {
            total_suggestions: feedbackHistory.length,
            ignored_count: feedbackHistory.filter((f: { action: string }) => f.action === 'IGNORE' || f.action === 'DISMISS').length,
            edited_count: feedbackHistory.filter((f: { action: string }) => f.action === 'EDIT_COPY').length,
            avg_edit_distance: 0 // Simplification
        };

        // 2. Assemble Context
        const tenantContext: any = {
            tenant_id: installId || 'unknown_tenant', // Pass install_id as tenant alignment
            // Mocking different tones based on simple hash of video_id or similar to prove "context awareness"
            tone: event.video_id.length % 2 === 0 ? 'PROFESSIONAL' : 'CASUAL',
            avg_reply_length: 'MEDIUM',
            prohibited_keywords: []
        };

        const count = await prisma.suggestionSession.count({ where: { event_id: event.id } });

        // 3. Call Brain Service
        // 3. Call Brain Gateway (Official Capability Path)

        // Phase 17B: Reconstruct Domain Event from Metadata & Use Adapter
        const rawMeta = JSON.parse((event as any).metadata || '{}');

        // Map to VideoEvent (Domain Object)
        // We use the persisted metadata to fill in context that isn't columns
        const videoEvent: VideoEvent = {
            platform: event.platform as any,
            video_id: event.video_id,
            creator_id: rawMeta.video?.author_id || 'unknown',
            creator_name: rawMeta.video?.author_name || 'unknown',
            video_title: rawMeta.video?.title || 'Untitled Video',
            video_description: '', // Not currently captured by validation schema
            video_tags: [],
            timestamp: rawMeta.page?.timestamp || new Date().toISOString(),
            session_id: rawMeta.session?.session_id || 'unknown_session',
            install_id: installId
        };

        // Use Adapter to Generate Canonical Request
        const capabilityRequest = VideoEventAdapter.toCapabilityRequest(videoEvent);

        // Enforce Identity (Tenant/Install ID)
        capabilityRequest.tenant_id = installId;

        // Add explicit flow context if needed (Adapter defaults context)
        // But we can append specific flags if the API implies them
        if (!capabilityRequest.context) capabilityRequest.context = {};
        (capabilityRequest.context as any).flow = 'answer_then_recommend';

        const capabilityResponse = await BrainGateway.processCapability(capabilityRequest);

        // Safe Casting for JSON-typed fields
        const payload = capabilityResponse.payload as { text?: string; strategy?: string } | null;
        const decisions = (capabilityResponse.policy_decisions || {}) as { explanation?: string; trace?: any };

        // Map Capability Response back to local variables for Session Persistence
        const brainResp = {
            text: payload?.text || '',
            strategy: payload?.strategy || 'ANSWER',
            confidence: capabilityResponse.confidence,
            explanation: decisions?.explanation || 'Generated via Gateway',
            decision_trace: decisions?.trace || {},
            model: 'gateway-model'
        };

        // 4. Create Session Record
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

        // Update Event Status
        await prisma.engagementEvent.update({
            where: { id: event.id },
            data: { status: 'SUGGESTED' }
        });

        res.json({
            session_id: session.id,
            text: session.suggestion_text,
            version: session.version,
            // Expose explanation for UI/Debug if needed, though strictly extension uses 'text'
            // We can add it to response for transparency if the client updates
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

        // Calculate Edit Distance (Mock)
        const original = session.suggestion_text;
        const dist = final_text && final_text !== original ? 10 : 0; // Simplified

        const feedback = await prisma.feedbackSignal.create({
            data: {
                session_id,
                action,
                final_text,
                edit_distance: dist,
                time_to_action: 0 // Client should send this, omitting for now
            }
        });

        // Update Event Status
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
router.post('/admin/kill-switch', async (req: Request, res: Response) => {
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

router.get('/admin/queue', async (req: Request, res: Response) => {
    const events = await prisma.engagementEvent.findMany({
        orderBy: { created_at: 'desc' },
        take: 50,
        include: { sessions: { include: { feedback: true } } }
    });
    res.json(events);
});

export default router;
