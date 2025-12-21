
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient(); // Local client

const BASE_URL = 'http://localhost:3005';

async function main() {
    console.log('--- VERIFYING PHASE 19.7 (User & Workspace) ---');

    // 1. Login
    console.log('\n[1] Testing Login...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dev@example.com', password: 'password123' })
    });

    if (!loginRes.ok) {
        console.error('Login Failed:', await loginRes.text());
        process.exit(1);
    }

    const { session_token, user, active_workspace_id } = await loginRes.json();
    console.log(`[PASS] Logged in as ${user.email}. Token: ${session_token.substring(0, 10)}...`);

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session_token}`
    };

    // 2. Create Workspace
    console.log('\n[2] Creating New Workspace...');
    const wsName = `WS_${Date.now()}`;
    const createWsRes = await fetch(`${BASE_URL}/workspaces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: wsName })
    });

    if (!createWsRes.ok) throw new Error(`Create WS Failed: ${await createWsRes.text()}`);
    const { account: newWs } = await createWsRes.json();
    console.log(`[PASS] Created Workspace: ${newWs.name} (${newWs.id})`);

    // 3. Verify Session Auto-Switch
    console.log('\n[3] Verifying Session Context...');
    const meRes = await fetch(`${BASE_URL}/auth/me`, { headers });
    const meData = await meRes.json();

    if (meData.session.active_workspace_id !== newWs.id) {
        throw new Error(`Session did not auto-switch! Expected ${newWs.id}, got ${meData.session.active_workspace_id}`);
    }
    console.log(`[PASS] Session is active on ${newWs.name}`);

    // 4. List Workspaces
    console.log('\n[4] Listing Workspaces...');
    const listRes = await fetch(`${BASE_URL}/workspaces`, { headers });
    const list = await listRes.json();
    if (!Array.isArray(list) || list.length < 1) throw new Error('List failed');
    console.log(`[PASS] Found ${list.length} workspace memberships.`);

    // 5. Ingestion Isolation (User Token should NOT work for Ingestion)
    console.log('\n[5] Verifying Ingestion Isolation...');
    const ingestRes = await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-install-id': 'install_dev_interactive',
            'Authorization': `Bearer ${session_token}` // Should be ignored or irrelevant, but endpoint demands x-install-id
        },
        body: JSON.stringify({ platform: 'test', video: { video_id: 'iso_test' }, comment: { comment_id: 'iso_cmt' } })
    });

    // Ingestion ignores Bearer token and relies on x-install-id. 
    // Wait, verification plan said "Verify User Session token CANNOT be used for /events".
    // If I send ONLY bearer token, it should fail.
    const badIngest = await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session_token}`
        },
        body: JSON.stringify({})
    });

    if (badIngest.status === 400 || badIngest.status === 401 || badIngest.status === 403) {
        console.log(`[PASS] Ingestion rejected request without x-install-id (Status: ${badIngest.status})`);
    } else {
        console.error(`[FAIL] Ingestion accepted request without Install ID! Status: ${badIngest.status}`);
        process.exit(1);
    }

    console.log('\n✅ PHASE 19.7 VERIFICATION COMPLETE');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
