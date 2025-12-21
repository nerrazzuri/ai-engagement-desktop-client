
import { PrismaClient } from '@prisma/client';
// import fetch from 'node-fetch'; // Use global fetch
import * as uuid from 'uuid';

// Setup
const BASE_URL = 'http://localhost:3005';
const prisma = new PrismaClient();

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function main() {
    log('--- VERIFYING PHASE 24 (Product Logic) ---');

    // 1. Setup User & Workspace
    const email = `phase24_test_${Date.now()}@example.com`;
    const password = 'password123';

    // Register User directly
    await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            password_hash: '$2b$10$FWCQOpSMy0VPsraU0rK.fuVDQJRzAs2AQl0jRSwAOt6/Lq3obFonG', // 'password123'
            status: 'ACTIVE'
        }
    });

    // Login to get Token
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (!loginRes.ok) throw new Error('Login Failed');
    const { session_token } = await loginRes.json();
    const headers = { 'Authorization': `Bearer ${session_token}`, 'Content-Type': 'application/json' };

    // Create Workspace
    const wsName = 'Phase24 Workspace';
    const wsRes = await fetch(`${BASE_URL}/workspaces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: wsName })
    });
    const wsData = await wsRes.json();
    const workspaceId = wsData.workspace_id;
    log(`Workspace Created: ${workspaceId}`);

    // Switch to Workspace
    await fetch(`${BASE_URL}/auth/switch-workspace`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspace_id: workspaceId })
    });

    // 2. Verify Defaults & Info
    log('[2] Verifying Product Info & Defaults...');
    const infoRes = await fetch(`${BASE_URL}/product/info`, { headers });
    const info = await infoRes.json();
    if (info.narrative.text.includes("Generic")) throw new Error("Narrative not matching canonical");
    log('Narrative Verified.');

    const planRes = await fetch(`${BASE_URL}/product/plan`, { headers });
    const plan = await planRes.json();
    if (plan.plan_id !== 'FREE') throw new Error(`Default plan should be FREE, got ${plan.plan_id}`);
    if (plan.limits.max_suggestions_per_day !== 5) throw new Error('Incorrect max suggestions for FREE');
    log('Plan Defaults Verified (FREE).');

    // 3. Verify Onboarding State (Initial)
    const onbRes1 = await fetch(`${BASE_URL}/product/onboarding`, { headers });
    const onb1 = await onbRes1.json();
    console.log('[DEBUG] Onboarding Response:', JSON.stringify(onb1));
    if (onb1.state !== 'CREATED') throw new Error(`Expected CREATED state, got ${onb1.state}`);
    log('Onboarding State: CREATED (Verified)');

    // 4. Ingest Event & Trigger Limit Check
    log('[4] Ingesting Events & Checking Limits...');

    // Create Install Registry for permissions
    const installId = uuid.v4();
    await prisma.installRegistry.create({
        data: {
            install_id: installId,
            install_secret: 'secret123',
            account_id: workspaceId,
            is_active: true
        }
    });

    // Ingest 1 Event (Should Advance Onboarding)
    const eventPayload = {
        platform: 'youtube',
        video: { video_id: 'vid_24', title: 'Phase 24 Test', author_name: 'Creator' },
        comment: { comment_id: 'c_24_1', text: 'Limits Test?', author_name: 'User' },
        page: { url: 'http://yt.com/watch?v=vid_24', title: 'Video', timestamp: new Date().toISOString() },
        session: { session_id: 'sess' }
    };

    const ingestHeaders = {
        'Content-Type': 'application/json',
        'x-install-id': installId,
        'x-install-secret': 'secret123'
    };

    const ingestRes = await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: ingestHeaders,
        body: JSON.stringify(eventPayload)
    });
    if (ingestRes.status !== 202) throw new Error('Ingest failed');
    log('Event Ingested.');

    // Wait for background processing (Onboarding advance)
    await new Promise(r => setTimeout(r, 2000));

    const onbRes2 = await fetch(`${BASE_URL}/product/onboarding`, { headers });
    const onb2 = await onbRes2.json();
    if (onb2.state !== 'FIRST_EVENT_INGESTED') throw new Error(`Expected FIRST_EVENT_INGESTED, got ${onb2.state}`);
    log('Onboarding Advanced: FIRST_EVENT_INGESTED');

    // 5. Suggestion Limit Test
    log('[5] Testing Suggestion Limits (Max 5)...');
    // We already have 1 event. Let's force create suggestions locally or via Ingest?
    // SuggestionService creation is clearer for testing Limit Logic quickly.
    // 5. Suggestion Limit Test
    log('[5] Testing Suggestion Limits (Max 5)...');

    // Create Dummy Suggestions
    const svcPath = require.resolve('../src/services/hitl/suggestion_service');
    console.log(`[DEBUG] SuggestionService Path: ${svcPath}`);
    const { SuggestionService } = require('../src/services/hitl/suggestion_service');
    // Need dummy params
    const dummyParams = {
        workspaceId,
        eventId: uuid.v4(), // Doesn't need to exist for enforcement check? Wait, DB constraint?
        // Actually SuggestionService.createSuggestion checks DB constraints?
        // Schema: event_id references EngagementEvent(id). So event MUST exist.
        // We will mock verify by relying on SuggestionService limit logic throwing.
        // Or we create 5 events?
    };

    // To be clean, let's create 1 Event and attach multiple suggestions to it (Allowed? Schema: event_id is FK. One event can have multiple suggestions).
    // Let's reuse 'c_24_1' event (need its internal ID).
    const dbEvent = await prisma.engagementEvent.findUnique({ where: { dedup_key: crypto.createHash('sha256').update(`youtube:vid_24:c_24_1`).digest('hex') } });
    if (!dbEvent) throw new Error('Event not found in DB');

    // Loop 5 times
    for (let i = 0; i < 5; i++) {
        await SuggestionService.createSuggestion({
            workspaceId,
            eventId: dbEvent.id,
            platform: 'youtube',
            videoId: 'vid_24',
            text: `Suggestion ${i}`,
            strategy: 'ANSWER',
            confidence: 0.9,
            signals: '{}',
            ownerSettingsSnapshot: '{}',
            contextType: 'OWNED_CONTENT'
        });
    }
    log('Created 5 suggestions (Limit Reached).');

    // Try 6th - Should Fail
    try {
        await SuggestionService.createSuggestion({
            workspaceId,
            eventId: dbEvent.id,
            platform: 'youtube',
            videoId: 'vid_24',
            text: `Suggestion 6`,
            strategy: 'ANSWER',
            confidence: 0.9,
            signals: '{}',
            ownerSettingsSnapshot: '{}'
        });
        throw new Error('Limit Check FAILED (Allowed 6th suggestion)');
    } catch (e: any) {
        if (e.message.includes("Plan Limit Exceeded")) {
            log('Limit Check PASSED (Blocked 6th suggestion).');
        } else {
            throw e; // Unexpected error
        }
    }

    // 6. Verify Onboarding State (Suggestion Created)
    const onbRes3 = await fetch(`${BASE_URL}/product/onboarding`, { headers });
    const onb3 = await onbRes3.json();
    if (onb3.state !== 'FIRST_SUGGESTION_CREATED') throw new Error(`Expected FIRST_SUGGESTION_CREATED, got ${onb3.state}`);
    log('Onboarding Advanced: FIRST_SUGGESTION_CREATED');

    log('SUCCESS: Phase 24 Verified.');
}

import * as crypto from 'crypto';

main().catch(e => {
    console.error(e);
    process.exit(1);
});
