
import { prisma } from '../src/db';
import { RateLimiter } from '../src/services/safety/rate_limiter';

async function verifyLimit() {
    console.log('--- Verifying Safety Limit Increase ---');
    const targetId = `verif_limit_${Date.now()}`;
    const accId = 'acct_dev_local'; // Use the dev account

    // 1. Simulate 5 events (well above the old limit of 1)
    for (let i = 0; i < 5; i++) {
        await prisma.engagementEvent.create({
            data: {
                dedup_key: `limit_test_${i}_${Date.now()}`,
                platform: 'test',
                target_id: targetId,
                account_id: accId,
                video_id: 'vid_limit_test',
                comment_id: `cmt_limit_${i}`,
                content_text: `reply ${i}`,
                status: 'DONE', // Counted as usage
                created_at: new Date()
            } as any
        });
    }

    // 2. Check Pre-Limits for a 6th attempt
    const target = {
        platform: 'test',
        target_id: targetId,
        accountId: accId
    };

    const result = await RateLimiter.checkPreLimits(target);

    if (result.allowed) {
        console.log('[PASS] Allowed 6th attempt (Limit > 5)');
    } else {
        console.error(`[FAIL] Blocked at 6th attempt: ${result.reason}`);
        process.exit(1);
    }
}

verifyLimit()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
