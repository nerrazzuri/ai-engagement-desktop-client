
import { prisma } from '../src/db';
import { RateLimiter } from '../src/services/safety/rate_limiter';
import { SafetyConfigService } from '../src/services/safety/config_service';

// Use native fetch (Node 18+) or a helper
const API_URL = 'http://localhost:3005';

async function verifyFinal() {
    console.log('=== Final Verification of Gaps A, C, D ===');

    // GAP D: Admin Protection
    console.log('\n--- Checking Gap D (Admin Auth) ---');
    const adminRes = await fetch(`${API_URL}/admin/queue`);
    if (adminRes.status === 401) {
        console.log('[PASS] /admin/queue returned 401 Unauthorized');
    } else {
        console.error(`[FAIL] /admin/queue returned ${adminRes.status} (Expected 401)`);
        process.exit(1);
    }

    // GAP A: Suggestions Fallback (Transport Layer)
    console.log('\n--- Checking Gap A (Suggestions Identity) ---');
    const suggRes = await fetch(`${API_URL}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: 'fake' })
    });

    if (suggRes.status === 400) {
        const json = await suggRes.json();
        if (json.error === 'Missing x-install-id') {
            console.log('[PASS] /suggestions returned 400 Missing x-install-id');
        } else {
            console.error(`[FAIL] /suggestions error message mismatch: ${JSON.stringify(json)}`);
            process.exit(1);
        }
    } else if (suggRes.status === 401) {
        console.log('[PASS] /suggestions returned 401 Unauthorized (Global Auth Middleware active)');
    } else {
        console.error(`[FAIL] /suggestions returned ${suggRes.status} (Expected 400 or 401)`);
        process.exit(1);
    }

    // GAP C: Video Isolation (Logic Layer)
    console.log('\n--- Checking Gap C (Account-Scoped Video Limits) ---');
    const videoId = `viral_final_${Date.now()}`;
    const accA = await prisma.account.create({ data: { status: 'ACTIVE', plan: 'FREE' } });
    const accB = await prisma.account.create({ data: { status: 'ACTIVE', plan: 'FREE' } });

    const limit = SafetyConfigService.getInstance().getLimits().max_replies_per_video;

    // Seed A
    for (let i = 0; i < limit; i++) {
        await prisma.engagementEvent.create({
            data: {
                dedup_key: `dedup_final_a_${i}_${Date.now()}`,
                platform: 'test',
                target_id: 'target_a',
                account_id: accA.id,
                video_id: videoId,
                comment_id: `cmt_final_a_${i}`,
                content_text: 'reply',
                status: 'DONE'
            } as any
        });
    }

    // Check A (Blocked)
    const resultA = await RateLimiter.checkPostLimits(videoId, accA.id);
    if (resultA.allowed) {
        console.error('CRITICAL FAIL: Account A should be blocked');
        process.exit(1);
    } else {
        console.log(`[PASS] Account A Blocked`);
    }

    // Check B (Allowed)
    const resultB = await RateLimiter.checkPostLimits(videoId, accB.id);
    if (!resultB.allowed) {
        console.error('CRITICAL FAIL: Account B blocked by A usage!');
        process.exit(1);
    } else {
        console.log(`[PASS] Account B Allowed (Gap C Closed)`);
    }

    console.log('\n✅ ALL CRITICAL GAPS VERIFIED.');
}

verifyFinal()
    .catch(e => {
        console.error('Verification Script Failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
