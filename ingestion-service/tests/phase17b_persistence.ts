
// Phase 17B Integration Test
// Verifies Persistence -> Metadata -> Adapter -> Brain Gateway flow

import { PrismaClient } from '@prisma/client';
import { VideoEvent } from '../src/adapters/video/schemas';
import { VideoEventAdapter } from '../src/adapters/video/video_event_adapter';
import { BrainGateway } from '../src/services/brain/brain_gateway';

const prisma = new PrismaClient();

async function runTest() {
    console.log('--- PHASE 17B: PERSISTENCE & ADAPTER INTEGRATION ---');

    try {
        // 1. Simulate Ingestion (POST /events)
        const mockRawEvent = {
            event_type: 'DESKTOP_CAPTURE',
            platform: 'youtube',
            video: {
                video_id: 'vid_17b',
                video_url: 'http://youtube.com/watch?v=vid_17b',
                title: 'Phase 17B Integration Demo',
                author_name: 'Tech Lead'
            },
            comment: {
                comment_id: 'com_17b',
                text: 'How does the persistence layer work now?',
                author_id: 'user_1'
            },
            page: {
                timestamp: new Date().toISOString()
            },
            session: {
                session_id: 'sess_17b',
                install_id: 'install_17b'
            }
        };

        const dedupKey = `youtube:${mockRawEvent.video.video_id}:${mockRawEvent.comment.comment_id}`;

        console.log('[1] Upserting Event with Metadata...');
        const event = await prisma.engagementEvent.upsert({
            where: { dedup_key: dedupKey },
            update: { metadata: JSON.stringify(mockRawEvent) },
            create: {
                dedup_key: dedupKey,
                platform: mockRawEvent.platform,
                video_id: mockRawEvent.video.video_id,
                comment_id: mockRawEvent.comment.comment_id,
                content_text: mockRawEvent.comment.text,
                metadata: JSON.stringify(mockRawEvent),
                status: 'NEW'
            }
        });
        console.log('    Saved Event ID:', event.id);

        // 2. Simulate Suggestion Request (POST /suggestions)
        console.log('[2] Reading Metadata & Reconstructing Domain Object...');

        const rawMeta = JSON.parse(event.metadata || '{}');

        // Logic mirroring ingest.ts
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
            install_id: 'install_17b'
        };

        console.log('    Reconstructed Video Title:', videoEvent.video_title);

        // 3. Adapter -> Gateway
        console.log('[3] Calling VideoEventAdapter -> BrainGateway...');
        const capRequest = VideoEventAdapter.toCapabilityRequest(videoEvent);
        capRequest.tenant_id = 'install_17b';

        const response = await BrainGateway.processCapability(capRequest);

        console.log('[4] Gateway Response:', response.kind);
        console.log('    Strategy:', response.payload.strategy);
        console.log('    Text:', response.payload.text);

        if (response.payload.strategy && response.payload.text) {
            console.log('✔ INTEGRATION PASSED');
        } else {
            throw new Error('Missing strategy or text in response');
        }

    } catch (err) {
        console.error('✖ TEST FAILED:', err);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
