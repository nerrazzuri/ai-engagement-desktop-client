
/**
 * RAW DOMAIN SCHEMAS
 * These are specific to the Video/Social domain and SHOULD NOT be imported by ai-core.
 */

export interface VideoEvent {
    platform: 'youtube' | 'tiktok' | 'instagram';
    video_id: string;
    creator_id: string;
    creator_name?: string;
    video_title?: string;
    video_description?: string; // e.g. from description box
    video_tags: string[];
    timestamp: string; // ISO8601

    // Session context
    session_id: string;
    install_id: string;
}

export interface CommentEvent {
    platform: 'youtube' | 'tiktok' | 'instagram';
    video_id: string;
    comment_id: string;
    comment_text: string;
    commenter_id?: string;
    commenter_name?: string;
    timestamp: string; // ISO8601

    // Session context
    session_id: string;
}
