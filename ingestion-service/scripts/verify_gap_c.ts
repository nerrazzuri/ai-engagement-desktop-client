
import { prisma } from '../src/db';
import { RateLimiter } from '../src/services/safety/rate_limiter';
import { SafetyConfigService } from '../src/services/safety/config_service';

async function verifyGapC() {
    console.log('=== Verifying Gap C: Account-Scoped Video Limits ===');

    const videoId = `viral_vid_${Date.now()}`;
    // Create 2 Accounts
    const accA = await prisma.account.create({ data: { status: 'ACTIVE', plan: 'FREE' } });
    const accB = await prisma.account.create({ data: { status: 'ACTIVE', plan: 'FREE' } });

    console.log(`Created Accounts: A=${accA.id}, B=${accB.id}`);

    // Config: Max 2 replies per video
    // We assume default config (e.g. 2 or 3). Let's force it to be sure if we can, or just hit the limit.
    const limit = SafetyConfigService.getInstance().getLimits().max_replies_per_video;
    console.log(`Limit per video: ${limit}`);

    // 1. Account A hits the limit
    console.log('Seeding Account A events...');
    for (let i = 0; i < limit; i++) {
        await prisma.engagementEvent.create({
            data: {
                id: `evt_a_${i}_${Date.now()}`,
                dedup_key: `dedup_a_${i}_${Date.now()}`,
                platform: 'test',
                target_id: 'target_a',
                account_id: accA.id,
                video_id: videoId,
                comment_id: `cmt_a_${i}`,
                content_text: 'reply',
                status: 'DONE'
            }
        });
    }

    // 2. Check Account A (Should be Blocked)
    const resultA = await RateLimiter.checkPostLimits(videoId, accA.id);
    console.log(`Account A Check (Expected Blocked): ${!resultA.allowed ? 'PASS' : 'FAIL'} (${resultA.reason})`);

    if (resultA.allowed) {
        console.error('CRITICAL FAIL: Account A should be blocked');
        process.exit(1);
    }

    // 3. Check Account B (Should be Allowed - The Gap C Fix)
    const resultB = await RateLimiter.checkPostLimits(videoId, accB.id);
    console.log(`Account B Check (Expected Allowed): ${resultB.allowed ? 'PASS' : 'FAIL'}`);

    if (!resultB.allowed) {
        console.error('CRITICAL FAIL: Account B was blocked by Account A usage! (Gap C Exists)');
        process.exit(1);
    }

    console.log('✅ Gap C Verified: Video Limits are Account-Scoped.');
}

verifyGapC()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
