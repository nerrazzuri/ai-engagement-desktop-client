
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005';
const ADMIN_KEY = 'mysupersecret';

const log = (msg: string) => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${msg}`);
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    log('--- VERIFYING PHASE 23 (Context Safety) ---');

    // 1. Setup Session
    const email = `dev_${Date.now()}@example.com`;
    const password = 'password123';

    // Register via DB directly (AuthService.register is missing in API)
    log('Registering user via DB...');
    await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
            email,
            password_hash: '$2b$10$FWCQOpSMy0VPsraU0rK.fuVDQJRzAs2AQl0jRSwAOt6/Lq3obFonG', // 'password123'
            status: 'ACTIVE'
        }
    });

    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!loginRes.ok) throw new Error('Login Failed: ' + await loginRes.text());
    const { session_token } = await loginRes.json();
    log(`Session Token: ${session_token.substring(0, 10)}...`);

    const headers = {
        'Authorization': `Bearer ${session_token}`,
        'Content-Type': 'application/json'
    };

    // 2. Setup Workspace & Install
    const wsName = `SafetyTest_${uuidv4().substring(0, 8)}`;
    const wsRes = await fetch(`${BASE_URL}/workspaces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: wsName })
    });
    const ws = await wsRes.json();
    const workspaceId = ws.account.id;
    log(`Workspace: ${workspaceId} (${wsName})`);

    const installRes = await fetch(`${BASE_URL}/workspaces/install`, {
        method: 'POST',
        headers: { ...headers, 'x-workspace-id': workspaceId },
        body: JSON.stringify({ type: 'chrome_extension', version: '1.0.0' })
    });

    if (!installRes.ok) {
        throw new Error(`Install Failed: ${await installRes.text()}`);
    }

    const install = await installRes.json();
    // API returns the object directly
    const { install_id, install_secret } = (install.install || install) as any;

    if (!install_id) {
        throw new Error('MISSING INSTALL ID! Object: ' + JSON.stringify(install));
    }
    log(`Install ID: ${install_id}`);

    // 3. Configure Settings DIRECTLY (Bypass API transient errors)
    log('[3] Configuring Owner Settings (Assertive) via DB...');
    try {
        await prisma.ownerSettings.upsert({
            where: { workspace_id: workspaceId },
            update: {
                mode: 'SUGGEST',
                aggressiveness: 'ASSERTIVE',
                platforms_enabled: JSON.stringify(['youtube']),
                updated_at: new Date()
            },
            create: {
                workspace_id: workspaceId,
                mode: 'SUGGEST',
                aggressiveness: 'ASSERTIVE',
                platforms_enabled: JSON.stringify(['youtube']),
                enable_intents: JSON.stringify({}),
                min_intent_confidence: 0.7,
                max_suggestions_per_day: 20,
                max_suggestions_per_video: 2,
                cooldown_hours: 24,
                tone: 'PROFESSIONAL' // Ensure required
            }
        });
        log('Settings Updated via DB.');
    } catch (e: any) {
        log(`Settings DB Exception: ${e.message}`);
        // If DB fails, we can't verify intent
        throw e;
    }
    await wait(2000);

    // 4. Ingest Unknown Context Event
    log('[4] Ingesting Unknown Event (High Intent)...');

    const eventId = `vid_unsafe_${Date.now()}`;
    const cleanPayload = {
        event_type: 'browser_capture',
        session: { session_id: uuidv4(), install_id }, // Must be UUID
        page: { url: 'https://youtube.com/watch?v=unsafe', title: 'Competitor Video', timestamp: new Date().toISOString(), page_type: 'VIDEO' },
        video: { video_id: eventId, title: 'Competitor Video', author_name: 'Competitor Channel', author_id: 'competitor_channel_id', video_url: 'https://youtube.com/watch?v=unsafe' },
        comment: { comment_id: `c_${Date.now()}`, text: 'Where can I buy this?', author_name: 'Lead', author_id: 'u1' },
        platform: 'youtube',
        context: { visible: true },
        client_meta: { version: '1.0', extension_version: '1.0.0', browser: 'chrome', os: 'windows' }
    };

    const ingestRes = await fetch(`${BASE_URL}/events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-install-id': install_id,
            'x-install-secret': install_secret
        },
        body: JSON.stringify(cleanPayload)
    });

    if (ingestRes.status !== 202) {
        throw new Error(`Ingest failed: ${ingestRes.status}`);
    }
    log('Event ingested. Waiting for processing...');
    await wait(15000);

    // 5. Verify Suggestion Details
    const listRes = await fetch(`${BASE_URL}/suggestions?status=PENDING`, {
        headers: { ...headers, 'x-workspace-id': workspaceId }
    });
    const suggestions = await listRes.json();

    if (suggestions.length === 0) {
        console.error('No suggestions found! Checking admin queue...');
        const adminRes = await fetch(`${BASE_URL}/admin/queue`, {
            headers: { 'x-admin-key': ADMIN_KEY }
        });
        const adminEvents = await adminRes.json();
        const myEvent = adminEvents.find((e: any) => e.video_id === eventId);
        if (myEvent) {
            console.log('Event Status:', myEvent.status);
            const meta = JSON.parse(myEvent.metadata || '{}');
            console.log('Value Outcome:', meta.value_outcome);
            if (meta.value_outcome && meta.value_outcome.result === 'BLOCKED') {
                // If Safety blocked entire suggestion creation (e.g. SILENT_CAPTURE), that's also safe.
                log('Suggestion was BLOCKED/SILENTLY CAPTURED. This is also SAFE behavior.');
                return;
            }
        }
        throw new Error('Suggestion generation failed silently.');
    } else {
        const sugg = suggestions[0];
        log('Suggestion Found!');
        log(`Context: ${sugg.context_type}`);
        log(`Role: ${sugg.speaker_role}`);
        log(`Template: ${sugg.template_category}`);

        if (sugg.context_type !== 'UNKNOWN_CONTEXT') throw new Error(`Wrong Context: ${sugg.context_type}`);

        if (sugg.speaker_role === 'OWNER') {
            throw new Error('CRITICAL SAFETY FAILURE: Role is OWNER on Unknown Content!');
        }

        if (sugg.template_category === 'OWNER_PROMOTIONAL') {
            throw new Error('CRITICAL SAFETY FAILURE: Template is OWNER_PROMOTIONAL on Unknown Content!');
        }

        log('✅ SAFETY CHECK PASSED: System did not impersonate owner.');
        log('✅ STRICT GATING VERIFIED.');
    }
}

main()
    .catch(err => {
        console.error('FAILED:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
