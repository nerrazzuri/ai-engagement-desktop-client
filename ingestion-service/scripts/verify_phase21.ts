import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

// This script verifies Phase 21 HITL workflow via HTTP (No direct DB).

function log(msg: string) {
    console.log(msg);
    fs.appendFileSync('verify.log', msg + '\n');
}

const BASE_URL = 'http://localhost:3005';

async function main() {
    fs.writeFileSync('verify.log', ''); // Clear log
    log('--- VERIFYING PHASE 21 (HITL Layer) ---');

    // 1. Login
    log('\n[1] Login...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dev@example.com', password: 'password123' })
    });
    if (!loginRes.ok) throw new Error('Login failed');
    const { session_token } = await loginRes.json();
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session_token}`
    };

    // 2. Create Workspace
    console.log('\n[2] Creating Workspace...');
    const wsName = `WS_Phase21_${Date.now()}`;
    const createRes = await fetch(`${BASE_URL}/workspaces`, {
        method: 'POST', body: JSON.stringify({ name: wsName }), headers
    });
    const { account: ws } = await createRes.json();
    const workspaceId = ws.id;

    // 3. Create Install
    console.log('\n[3] Creating Install...');
    const installId = `inst_p21_${Date.now()}`;
    await fetch(`${BASE_URL}/owner/installs`, {
        method: 'POST', body: JSON.stringify({ install_id: installId }), headers: { ...headers, 'x-workspace-id': workspaceId }
    });

    // 4. Ingest Event (Trigger Suggestion)
    console.log('\n[4] Ingesting Event...');
    const eventPayload = {
        event_type: 'DESKTOP_CAPTURE',
        platform: 'youtube',
        session: {
            session_id: '123e4567-e89b-12d3-a456-426614174000',
            install_id: installId
        },
        page: {
            url: 'http://youtube.com/watch?v=vid_hitl_1',
            page_type: 'VIDEO',
            timestamp: new Date().toISOString()
        },
        video: {
            video_id: 'vid_hitl_1',
            video_url: 'http://youtube.com/watch?v=vid_hitl_1',
            title: 'HITL Demo',
            author_name: 'Creator',
            author_id: 'c1'
        },
        comment: {
            comment_id: `cmt_${Date.now()}`,
            text: 'This is a great product question?',
            author_name: 'User',
            author_id: 'u1'
        },
        context: {
            visible: true,
            position: 'viewport',
            user_action: 'manual_trigger'
        },
        client_meta: {
            extension_version: '1.0.0',
            browser: 'chrome',
            os: 'windows'
        }
    };

    // Using Install ID headers
    const ingestRes = await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-install-id': installId,
            'x-install-secret': 'secret'
        },
        body: JSON.stringify(eventPayload)
    });

    if (!ingestRes.ok) console.error(await ingestRes.text());
    console.log('Ingest Status:', ingestRes.status);

    // Wait for async ingestion
    log('Waiting for background processing (8s)...');
    await new Promise(r => setTimeout(r, 8000));

    // 5. List Suggestions
    console.log('\n[5] Listing Suggestions...');
    const listRes = await fetch(`${BASE_URL}/suggestions?status=PENDING`, { headers: { ...headers, 'x-workspace-id': workspaceId } });
    const suggestions = await listRes.json();
    console.log(`Found ${suggestions.length} suggestions.`);

    if (suggestions.length === 0) throw new Error('No suggestions created!');
    const suggestionId = suggestions[0].id;

    // 6. Get Detail (Explainability)
    console.log(`\n[6] Detail for ${suggestionId}...`);
    const detailRes = await fetch(`${BASE_URL}/suggestions/${suggestionId}`, { headers: { ...headers, 'x-workspace-id': workspaceId } });
    const detail = await detailRes.json();
    console.log('Explanation:', detail.explanation?.summary);
    if (!detail.explanation) throw new Error('Missing explanation');

    // 7. Approve
    log('\n[7] Approving...');
    const approveRes = await fetch(`${BASE_URL}/suggestions/${suggestionId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Looks good' }),
        headers: { ...headers, 'x-workspace-id': workspaceId }
    });
    log('Approve Status: ' + approveRes.status);
    if (!approveRes.ok) {
        const err = await approveRes.text();
        log('Approve Error Body: ' + err);
        throw new Error('Approve failed: ' + err);
    }

    // 8. Verify Status
    console.log('\n[8] Verifying Status...');
    const verifyRes = await fetch(`${BASE_URL}/suggestions/${suggestionId}`, { headers: { ...headers, 'x-workspace-id': workspaceId } });
    const verified = await verifyRes.json();
    console.log('Verified Payload:', JSON.stringify(verified, null, 2));
    if (verified.status !== 'APPROVED') throw new Error(`Status not updated. Got: ${verified.status}`);

    console.log('\n✅ PHASE 21 VERIFIED!');
}

main().catch(console.error);
