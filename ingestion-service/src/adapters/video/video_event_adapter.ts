
import { CapabilityRequest, JsonObject } from '../../core/contracts';
import { VideoEvent } from './schemas';

/**
 * Adapter: VideoEvent -> CapabilityRequest
 * Purpose: Translate video context into an engagement request.
 * 
 * Rules:
 * - NO ranking/scoring decisions.
 * - NO platform specific logic in output.
 * - Deterministic mapping.
 */
export class VideoEventAdapter {
    static toCapabilityRequest(event: VideoEvent): CapabilityRequest {
        // Log input for replayability (debug level - simulated)
        // console.debug('[Adapter] Ingesting VideoEvent:', event.video_id);

        // Map query: Text (Comment/Caption) > Title > Description > Empty
        const query = event.text || event.video_title || event.video_description || "";

        // Define objects with satisfies for type safety without unsafe casts
        const videoContext = {
            title: event.video_title || null,
            description: event.video_description || null,
            tags: event.video_tags
        } satisfies JsonObject;

        const rawEvent = {
            video_id: event.video_id,
            creator_name: event.creator_name || null,
            platform: event.platform
        } satisfies JsonObject;

        return {
            version: 'v1',
            channel: 'desktop',
            input: {
                query: query
            },
            context: {
                flow: 'answer_then_recommend',
                domain: 'video',
                session_id: event.session_id,
                // Minimal descriptive context for AI
                video_context: videoContext,
                raw_event: rawEvent
            }
            // Identity fields removed entirely per architecture strictness
        };
    }
}
