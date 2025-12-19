import { z } from 'zod';

// ==========================================
// 1. RAW INPUT: DesktopCaptureEvent
// ==========================================

export const DesktopCaptureEventSchema = z.object({
    event_type: z.literal('DESKTOP_CAPTURE'),
    platform: z.enum(['youtube', 'tiktok', 'instagram', 'rednote']),

    session: z.object({
        session_id: z.string().uuid(),
        install_id: z.string(), // Replaces user_id in raw capture for auth binding
        account_hint: z.string().optional(),
    }),

    page: z.object({
        url: z.string().url(),
        page_type: z.literal('VIDEO'),
        timestamp: z.string().datetime(), // ISO8601
    }),

    video: z.object({
        video_id: z.string(),
        video_url: z.string().url(),
        title: z.string().nullable(),
        author_id: z.string().nullable(),
        author_name: z.string().nullable(),
    }),

    comment: z.object({
        comment_id: z.string(),
        author_id: z.string(),
        author_name: z.string().nullable(),
        text: z.string(),
        language_hint: z.enum(['en', 'zh']).optional().nullable(),
        like_count: z.number().default(0),
        reply_count: z.number().default(0),
    }),

    context: z.object({
        visible: z.boolean(),
        position: z.enum(['viewport', 'expanded']),
        user_action: z.enum(['scroll', 'hover', 'click', 'manual_trigger']),
    }),

    client_meta: z.object({
        extension_version: z.string(),
        browser: z.string(),
        os: z.enum(['windows', 'mac']),
    }),
});

export type DesktopCaptureEvent = z.infer<typeof DesktopCaptureEventSchema>;

// ==========================================
// 2. STRICT OUTPUT: EngagementEvent
// ==========================================

export const EngagementEventSchema = z.object({
    trace_id: z.string().uuid(),
    platform: z.string(),
    video_id: z.string(),
    video_url: z.string(),

    comment_id: z.string(),
    comment_author_id: z.string(),
    comment_text: z.string(),

    engagement_context: z.object({
        source: z.literal('desktop_extension'),
        human_in_loop: z.literal(true),
    }),

    rag_access_token: z.string(),
});

export type EngagementEvent = z.infer<typeof EngagementEventSchema>;

// ==========================================
// 3. API RESPONSES
// ==========================================

export interface IngestionResponse {
    status: 'success' | 'ignored';
    message: string;
    recommendation?: {
        available: boolean;
        text?: string; // Phase X result would go here if we were deciding things, but simple "Ready" is enough for now
    };
}
