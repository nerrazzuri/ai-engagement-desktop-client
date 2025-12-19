
// Mock requirements for Node env
declare var process: any;
declare var require: any;
const assert = require('assert');

import { VideoEventAdapter } from '../src/adapters/video/video_event_adapter';
import { VideoEvent } from '../src/adapters/video/schemas';
import { BrainGateway } from '../src/services/brain/brain_gateway';
// Env vars for BrainService logic (if needed)

async function runTest() {
    console.log('--- PHASE 17A: WIRING VERIFICATION (GATEWAY SPLIT) ---');

    // 1. Create Raw Event
    const vEvent: VideoEvent = {
        platform: 'youtube',
        video_id: 'test_vid_17a',
        creator_id: 'creator_1',
        creator_name: 'TechReviewer',
        video_title: 'Is AI Dangerous?',
        video_description: 'Discussing the risks of AI.',
        video_tags: ['ai', 'tech'],
        timestamp: new Date().toISOString(),
        session_id: 'sess_1',
        install_id: 'install_1'
    };

    console.log('[1] Raw Event Created:', vEvent.video_title);

    // 2. Adapter: Translate to CapabilityRequest
    const capRequest = VideoEventAdapter.toCapabilityRequest(vEvent);
    console.log('[2] Canonical Request Generated (v1):', capRequest.version);

    // Inject identity (simulating Orchestrator)
    capRequest.tenant_id = 'test-tenant-17a';

    // 3. Brain: Process Capability
    try {
        console.log('[3] Calling BrainGateway.processCapability()...');
        const capResponse = await BrainGateway.processCapability(capRequest);

        console.log('[4] Brain Response Received:', capResponse.kind);
        console.log('    Payload:', capResponse.payload);

        // Assertions
        assert.equal(capResponse.kind, 'answer');
        assert.ok((capResponse.payload as any).text, 'Response payload missing text');
        assert.ok((capResponse.payload as any).strategy, 'Response payload missing strategy');

        console.log('✔ VERIFICATION PASSED');
    } catch (err) {
        console.error('✖ VERIFICATION FAILED:', err);
        process.exit(1);
    }
}

runTest();
