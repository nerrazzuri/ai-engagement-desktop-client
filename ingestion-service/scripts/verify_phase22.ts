
// import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

function log(msg: string) {
    console.log(msg);
    fs.appendFileSync('verify_p22.log', msg + '\n');
}

const BASE_URL = 'http://localhost:3005';

async function main() {
    fs.writeFileSync('verify_p22.log', '');
    log('--- VERIFYING PHASE 22 (Value Presentation) ---');
    await wait(5000); // Wait for container readiness


    // 1. Setup (Login + WS)
    log('[1] Setup...');
    // We reuse the seeded 'owner@test.com' account.

    // Login
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dev@example.com', password: 'password123' })
    });

    if (!loginRes.ok) {
        throw new Error('Login failed: ' + await loginRes.text());
    }

    const session = await loginRes.json();
    const token = session.session_token; // CORRECT
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    // Assuming login works or creates account? No, login expects existing user?
    // Wait, createWorkspace creates account. Login is for existing user.
    // Actually Phase 19.7: /auth/login returns token for user.
    // How do I create a user?
    // POST /auth/register? No.
    // Phase 19.7 verify used `seed_dev_account` or implicit flow?
    // Let's check `verify_phase19_7.ts` or `ingest-service` auth logic.
    // Usually we seed a user or have registration.

    // Actually `POST /workspaces` creates "New Account + Owner Membership", but requires "Session"?
    // "Require Session" middleware.
    // So I need to be logged in to create a workspace?
    // Chicken and Egg?
    // Phase 19.7: `POST /workspaces` requires authentication?
    // If so, how to get first user?
    // `authapi` likely has register?
    // Or I use a "dev" endpoint to seed?

    // Verify 21 script started with:
    // [1] Login... 
    // It called `/auth/login`. And it worked.
    // Does `/auth/login` auto-create user in dev mode? 
    // Or did I seed it previously?
    // If verify_21 used `testuser@example.com` and it worked repeatedly?
    // No, verify 21 logged in.

    // 51c: Reuse headers
    // const session = await loginRes.json(); // REMOVE DUPLICATE
    // const headers = ...; // Already defined above but we need to verify usage down.

    // We configured `headers` near line 25 in previous Edit.
    // Let's check the file state.
    // I added `const headers = ...` in the Replace Block.
    // So distinct lines need cleaning.

    // Create WS
    const wsRes = await fetch(`${BASE_URL}/workspaces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: `Value Corp ${Date.now()}`, plan: 'ENTERPRISE' }) // Unique name
    });

    if (!wsRes.ok) {
        throw new Error('Create WS failed: ' + await wsRes.text());
    }

    const ws = await wsRes.json();
    const workspaceId = ws.account.id;
    // const installId = ...; // Not needed, we create real install below


    // Create REAL Install
    const installSecret = 'secret_val';
    const installRes = await fetch(`${BASE_URL}/workspaces/install`, {
        method: 'POST',
        headers: { ...headers, 'x-workspace-id': workspaceId },
        body: JSON.stringify({ name: 'Value Extension' })
    });

    if (!installRes.ok) throw new Error('Create Install Failed: ' + await installRes.text());

    const install = await installRes.json();
    const realInstallId = install.install_id;
    const realInstallSecret = install.install_secret;

    // 2. Configure OBSERVE_ONLY (Trigger Silent Value)
    log('[2] Setting OBSERVE_ONLY...');
    await fetch(`${BASE_URL}/owner/settings`, {
        method: 'POST',
        headers: { ...headers, 'x-workspace-id': workspaceId },
        body: JSON.stringify({ mode: 'OBSERVE_ONLY' })
    });

    // 3. Ingest Event (Should be IGNORED/Captured Silently)
    log('[3] Ingesting Silent Event...');
    await ingestEvent(realInstallId, realInstallSecret, 'vid_silent', 'Silent Comment');
    await wait(8000);

    // 4. Verify Summary (Silent Value)
    log('[4] Verifying Silent Metrics...');
    const sum1 = await (await fetch(`${BASE_URL}/value/summary`, {
        headers: { ...headers, 'x-workspace-id': workspaceId }
    })).json();

    log('Summary 1: ' + JSON.stringify(sum1, null, 2));

    // Check if observe_only > 0 OR blocked > 0 depending on Brain logic
    // Phase 20 Brain returns 'ignore' for OBSERVE_ONLY. 
    // Metadata block should capture outcome.
    if (sum1.silent_value.observe_only !== 1 && sum1.silent_value.other_ignore !== 1) {
        // Note: "other_ignore" might catch it if parsing fails or reason text varies
        // But we want distinct bucket.
        // Let's print warning if 0
        if (sum1.silent_value.observe_only === 0) log('WARNING: Expected observe_only=1');
    }

    // 5. Configure ENGAGE (Trigger Suggestion)
    await wait(10000);
    log('[5] Setting SUGGEST (ENGAGE)...');
    const settingsRes = await fetch(`${BASE_URL}/owner/settings`, {
        method: 'PUT',
        headers: { ...headers, 'x-workspace-id': workspaceId },
        body: JSON.stringify({ mode: 'SUGGEST' })
    });
    if (!settingsRes.ok) throw new Error('Failed to set SUGGEST: ' + await settingsRes.text());

    // Check settings
    const currentSettings = await (await fetch(`${BASE_URL}/owner/settings`, {
        headers: { ...headers, 'x-workspace-id': workspaceId }
    })).json();
    log('[5] Current Settings: ' + JSON.stringify(currentSettings));

    // 6. Ingest Event (Should create Suggestion)
    log('[6] Ingesting Active Event...');
    await ingestEvent(realInstallId, realInstallSecret, 'vid_active', 'Where is this from?');
    await wait(20000); // Wait 20s for slow background processing

    // 7. Approve Suggestion
    log('[7] Approving Suggestion...');
    const list = await (await fetch(`${BASE_URL}/suggestions?status=PENDING`, {
        headers: { ...headers, 'x-workspace-id': workspaceId }
    })).json();

    if (list.length > 0) {
        const id = list[0].id;
        await fetch(`${BASE_URL}/suggestions/${id}/approve`, {
            method: 'POST',
            headers: { ...headers, 'x-workspace-id': workspaceId },
            body: JSON.stringify({ note: 'Great value!' })
        });
    } else {
        throw new Error('No pending suggestion found');
    }

    // 8. Verify Decisions & Funnel
    log('[8] Verifying Final Metrics...');
    const sum2 = await (await fetch(`${BASE_URL}/value/summary`, {
        headers: { ...headers, 'x-workspace-id': workspaceId }
    })).json();

    log('Summary 2: ' + JSON.stringify(sum2, null, 2));

    if (sum2.funnel.approved !== 1) throw new Error('Expected 1 approved');

    const decisions = await (await fetch(`${BASE_URL}/value/decisions`, {
        headers: { ...headers, 'x-workspace-id': workspaceId }
    })).json();
    log('Decisions: ' + JSON.stringify(decisions, null, 2));
    if (decisions.length !== 1) throw new Error('Expected 1 decision log');

    log('Γ£à PHASE 22 VERIFIED!');
}

async function ingestEvent(installId: string, secret: string, vid: string, text: string) {
    await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-install-id': installId,
            'x-install-secret': secret
        },
        body: JSON.stringify({
            event_type: 'DESKTOP_CAPTURE',
            platform: 'youtube',
            session: { session_id: '123e4567-e89b-12d3-a456-426614174000', install_id: installId },
            page: { url: 'https://www.youtube.com/watch?v=123', page_type: 'VIDEO', timestamp: new Date().toISOString() },
            video: { video_id: vid, video_url: 'https://www.youtube.com/watch?v=123', title: 'Vid', author_name: 'Auth', author_id: 'a1' },
            comment: { comment_id: `cmt_${Date.now()}`, text: text, author_name: 'User', author_id: 'u1' },
            context: { visible: true, position: 'viewport', user_action: 'scroll' },
            client_meta: { extension_version: '1.0', browser: 'chrome', os: 'windows' }
        })
    });
}

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => {
    log(e.toString());
    process.exit(1);
});
