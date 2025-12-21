import { prisma } from '../../db';
import { IngestionEvent, IngestionEventSchema } from '../../schemas/ingestion_contract';
import * as crypto from 'crypto';
import { PlanEnforcer } from '../product/plan_enforcer';
import { OwnerSettingsService } from '../owner/owner_settings_service';
import { VideoEventAdapter } from '../../adapters/video/video_event_adapter';
import { VideoEvent } from '../../adapters/video/schemas';
import { BrainGateway } from '../brain/brain_gateway';
import { SuggestionService } from '../hitl/suggestion_service';
import { v4 as uuidv4 } from 'uuid';

export enum IngestStatus {
    RECEIVED = 'RECEIVED',
    DUPLICATE = 'DUPLICATE', // Virtual status (we return 200 OK)
    BLOCKED_POLICY = 'BLOCKED_POLICY',
    BLOCKED_PLAN = 'BLOCKED_PLAN',
    OBSERVED = 'OBSERVED',
    SUGGESTED = 'SUGGESTED',
    ERROR = 'ERROR'
}

export class IngestionService {

    /**
     * Process a raw ingestion event.
     * Guaranteed 200 OK / Idempotent.
     */
    static async processEvent(
        rawEvent: any,
        installId: string,
        accountId: string,
        correlationId: string = uuidv4()
    ): Promise<{ status: IngestStatus; id?: string }> {

        // 1. Validation (Schema)
        const parse = IngestionEventSchema.safeParse(rawEvent);
        if (!parse.success) {
            console.warn(`[Ingest][${correlationId}] Schema Invalid:`, parse.error);
            throw new Error('Invalid Schema'); // 400 Bad Request at API layer
        }
        const event = parse.data;

        // 2. Dedup (Primary - External ID)
        const existingPrimary = await prisma.engagementEvent.findUnique({
            where: { external_event_id: event.event_id }
        });
        if (existingPrimary) {
            console.log(`[Ingest][${correlationId}] Dedup Primary Hit: ${event.event_id}`);
            return { status: IngestStatus.DUPLICATE, id: existingPrimary.id };
        }

        // 3. Dedup (Secondary - Content Hash)
        // Key: install_id + platform + video_id + comment_id + raw_text_hash
        const textHash = crypto.createHash('sha256').update(event.raw_text || '').digest('hex');
        const dedupKey = crypto.createHash('sha256')
            .update(`${installId}:${event.platform}:${event.platform_video_id}:${event.platform_comment_id || 'null'}:${textHash}`)
            .digest('hex');

        const existingSecondary = await prisma.engagementEvent.findUnique({
            where: { dedup_key: dedupKey }
        });
        if (existingSecondary) {
            console.log(`[Ingest][${correlationId}] Dedup Secondary Hit: ${dedupKey}`);
            // Silent Discard - Do not insert.
            return { status: IngestStatus.DUPLICATE, id: existingSecondary.id };
        }

        // 4. Plan Limits
        let status = IngestStatus.RECEIVED;
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const dailyCount = await prisma.engagementEvent.count({
                where: { account_id: accountId, created_at: { gte: startOfDay } }
            });
            await PlanEnforcer.checkLimit(accountId, 'events_per_day', dailyCount);
        } catch (e) {
            console.warn(`[Ingest][${correlationId}] Plan Limit Exceeded:`, e);
            status = IngestStatus.BLOCKED_PLAN;
            // Continue to persist as BLOCKED_PLAN
        }

        // 5. Persistence (Immutable)
        // We map strict contract to DB model
        const engagementEvent = await prisma.engagementEvent.create({
            data: {
                external_event_id: event.event_id,
                dedup_key: dedupKey,
                platform: event.platform,
                video_id: event.platform_video_id,
                comment_id: event.platform_comment_id || 'null',
                content_text: event.raw_text || '',
                target_id: 'unknown', // No enrichment allowed yet
                account_id: accountId,
                install_id: installId,
                status: status, // RECEIVED or BLOCKED_PLAN
                observed_at: new Date(event.observed_at),
                metadata: JSON.stringify({
                    ...event,
                    correlation_id: correlationId
                }) // Store full raw data
            }
        });

        if (status === IngestStatus.BLOCKED_PLAN) {
            return { status: IngestStatus.BLOCKED_PLAN, id: engagementEvent.id };
        }

        // 6. Logic (Observe vs Suggest)
        try {
            const settings = await OwnerSettingsService.getSettings(accountId);

            // Mode Check
            if (settings.mode === 'OBSERVE_ONLY') {
                await prisma.engagementEvent.update({
                    where: { id: engagementEvent.id },
                    data: { status: IngestStatus.OBSERVED }
                });
                console.log(`[Ingest][${correlationId}] Mode OBSERVE -> Stopped.`);
                return { status: IngestStatus.OBSERVED, id: engagementEvent.id };
            }

            // SUGGEST Mode
            console.log(`[Ingest][${correlationId}] Triggering Suggestion Pipeline...`);

            // Invoke Pipeline (Reusing logic from triggerAutoSuggest but cleaner)
            // Adapter
            const videoEvent: VideoEvent = {
                platform: event.platform as any,
                video_id: event.platform_video_id,
                creator_id: 'unknown', // Explicit no enrichment
                creator_name: 'unknown',
                video_title: 'unknown',
                video_description: '',
                video_tags: [],
                timestamp: event.observed_at, // Use source time
                session_id: 'ingest_session',
                install_id: installId,
                text: event.raw_text || ''
            };

            const req = VideoEventAdapter.toCapabilityRequest(videoEvent);
            req.tenant_id = installId;
            if (!req.context) req.context = {};
            req.context.raw_event = {
                account_id: accountId,
                correlation_id: correlationId // Propagate!
            };

            // Brain Call
            const resp = await BrainGateway.processCapability(req);

            // Value Outcome
            if ((resp.kind as any) === 'ignore' || (resp.kind as any) === 'error') {
                await prisma.engagementEvent.update({
                    where: { id: engagementEvent.id },
                    data: { status: (resp.kind as any) === 'error' ? 'ERROR' : 'IGNORED' } // Or 'OBSERVED'? Plan says 'OBSERVED' is for mode. Just use IGNORED.
                });
                return { status: IngestStatus.OBSERVED, id: engagementEvent.id };
            }

            // Create Suggestion
            const p = resp.payload as any;
            await SuggestionService.createSuggestion({
                workspaceId: accountId,
                eventId: engagementEvent.id,
                platform: event.platform,
                videoId: event.platform_video_id,
                commentId: event.platform_comment_id || 'null',
                text: p?.text || '',
                strategy: p?.strategy,
                confidence: resp.confidence ?? 0,
                signals: JSON.stringify(resp.policy_decisions || {}),
                ownerSettingsSnapshot: JSON.stringify(settings)
            });

            await prisma.engagementEvent.update({
                where: { id: engagementEvent.id },
                data: { status: IngestStatus.SUGGESTED }
            });

            return { status: IngestStatus.SUGGESTED, id: engagementEvent.id };

        } catch (err) {
            console.error(`[Ingest][${correlationId}] Pipeline Error:`, err);
            // Don't crash ingestion response, just log async failure
            // But we are async anyway? No, processEvent is awaited by API? 
            // Plan said "Process Asynchronously" in old ingest. 
            // In new strict ingest, we might want to await if we want to confirm "Received" vs "Blocked".
            // The plan says "Persist". Post-persistence logic can be async if we want fast response.
            // But for reliability, waiting is safer unless perf is critical. 
            // We'll await for now to ensure we capture BLOCKED status correctly if logic fails synchronously.
        }

        return { status: IngestStatus.RECEIVED, id: engagementEvent.id };
    }
}
