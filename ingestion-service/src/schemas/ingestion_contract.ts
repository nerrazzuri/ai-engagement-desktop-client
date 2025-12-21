import { z } from 'zod';

// Phase 28: Strict Ingestion Contract
// Transport only. No enrichment.

export const IngestionEventSchema = z.object({
    event_id: z.string().uuid(),
    event_type: z.enum(['VIDEO_VIEW', 'COMMENT_VIEW', 'COMMENT_TEXT']),
    platform: z.enum(['TIKTOK', 'YOUTUBE', 'IG', 'OTHER']),

    platform_video_id: z.string().min(1),
    platform_comment_id: z.string().nullable().optional(),

    raw_text: z.string().nullable().optional(),

    observed_at: z.string().datetime(), // ISO UTC String
});

export type IngestionEvent = z.infer<typeof IngestionEventSchema>;
