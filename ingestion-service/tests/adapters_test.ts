
// Mock requirements for Node env
declare var process: any;
declare var require: any;

const assert = require('assert');
import { VideoEventAdapter } from '../src/adapters/video/video_event_adapter';
import { CommentEventAdapter } from '../src/adapters/video/comment_event_adapter';
import { VideoEvent, CommentEvent } from '../src/adapters/video/schemas';

async function runTests() {
    console.log('--- ADAPTER LAYER VERIFICATION (STRICT) ---');
    let passed = 0;
    let failed = 0;

    function check(name: string, condition: boolean) {
        if (condition) {
            console.log(`✔ ${name}`);
            passed++;
        } else {
            console.error(`✖ ${name}`);
            failed++;
        }
    }

    // 1. VideoEventAdapter Test
    console.log('\n[VideoEventAdapter]');
    const vEvent: VideoEvent = {
        platform: 'youtube',
        video_id: 'v123',
        creator_id: 'c1',
        creator_name: 'MrBeast',
        video_title: 'Challenge Video',
        video_description: 'Best challenge ever',
        video_tags: ['fun', 'challenge'],
        timestamp: '2025-01-01T00:00:00Z',
        session_id: 's1',
        install_id: 'i1'
    };

    const vReq = VideoEventAdapter.toCapabilityRequest(vEvent);

    check('Flow is "answer_then_recommend"', vReq.context.flow === 'answer_then_recommend');
    check('Domain is "video"', vReq.context.domain === 'video');
    check('Query uses Title', vReq.input.query === 'Challenge Video');
    check('Channel is "desktop"', vReq.channel === 'desktop');
    check('Version is "v1"', vReq.version === 'v1');
    check('Raw Event in CONTEXT', (vReq.context.raw_event as any)?.video_id === 'v123');
    check('Input clean of raw_event', (vReq.input as any).raw_event === undefined);
    check('Tenant ID absent', vReq.tenant_id === undefined);

    // 2. CommentEventAdapter Test
    console.log('\n[CommentEventAdapter]');
    const cEvent: CommentEvent = {
        platform: 'youtube',
        video_id: 'v123',
        comment_id: 'cm1',
        comment_text: 'Is this real?',
        commenter_id: 'u1',
        commenter_name: 'Viewer1',
        timestamp: '2025-01-01T00:01:00Z',
        session_id: 's1'
    };
    const visible = [{ id: 'cm2', text: 'Yes' }, { id: 'cm3', text: 'No' }];

    const cReq = CommentEventAdapter.toCapabilityRequest(cEvent, visible);

    check('Flow is "recommend_only"', cReq.context.flow === 'recommend_only');
    check('Domain is "comment"', cReq.context.domain === 'comment');
    check('Query is comment text', cReq.input.query === 'Is this real?');
    check('Candidates passed through', cReq.context.candidates?.length === 2);
    check('Version is "v1"', cReq.version === 'v1');
    check('Raw Event in CONTEXT', (cReq.context.raw_event as any)?.comment_id === 'cm1');
    check('Input clean of raw_event', (cReq.input as any).raw_event === undefined);
    check('Tenant ID absent', cReq.tenant_id === undefined);

    console.log(`\nSummary: ${passed} PASSED, ${failed} FAILED`);
    if (failed > 0) process.exit(1);
}

runTests();
