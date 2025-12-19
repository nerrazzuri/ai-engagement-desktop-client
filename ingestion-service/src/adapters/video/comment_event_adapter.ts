
import { CapabilityRequest, JsonObject, JsonValue } from '../../core/contracts';
import { CommentEvent } from './schemas';

/**
 * Adapter: CommentEvent -> CapabilityRequest
 * Purpose: Translate comment interaction into a recommendation request.
 * 
 * Rules:
 * - NO ranking/scoring decisions.
 * - NO sentiment analysis here.
 * - Pass candidates through as-is.
 */
export class CommentEventAdapter {
    /**
     * @param event The active comment being engaged with
     * @param visibleComments List of other visible comments (candidates for comparison/context)
     */
    static toCapabilityRequest(event: CommentEvent, visibleComments: any[] = []): CapabilityRequest {
        // Log input for replayability
        // console.debug('[Adapter] Ingesting CommentEvent:', event.comment_id);

        const commentContext = {
            author: event.commenter_name || null,
            timestamp: event.timestamp
        } satisfies JsonObject;

        const rawEvent = {
            comment_id: event.comment_id,
            commenter_name: event.commenter_name || null,
            platform: event.platform,
            video_id: event.video_id
        } satisfies JsonObject;

        return {
            version: 'v1',
            channel: 'desktop',
            input: {
                query: event.comment_text
            },
            context: {
                flow: 'recommend_only',
                domain: 'comment',
                session_id: event.session_id,

                // Pass candidates for core ranking/filtering skills
                candidates: visibleComments as unknown as JsonValue[],

                // Context about the comment itself
                comment_context: commentContext,
                raw_event: rawEvent
            }
            // Identity fields removed entirely
        };
    }
}
