
import { SafetyConfigService } from '../src/services/safety/config_service';
import { SafetyService } from '../src/services/safety/safety_service';
import { prisma } from '../src/db';
import { randomUUID } from 'crypto';

// Helper to seed 'replies' in DB to trigger limits
async function seedReplies(targetId: string, videoId: string, count: number, accountId: string = 'test_account_123') {
    console.log(`[Seed] Inserting ${count} replies for ${targetId} (Account: ${accountId})...`);
    for (let i = 0; i < count; i++) {
        await prisma.engagementEvent.create({
            data: {
                id: randomUUID(),
                dedup_key: randomUUID(), // Random to allow multiples
                platform: 'test_platform',
                video_id: videoId,
                content_text: 'seeded_reply',
                status: 'DONE', // Counts as usage
                metadata: JSON.stringify({ author_name: targetId.split(':')[1] }),
                target_id: targetId, // Test exact match
                account_id: accountId, // Passed arg
                created_at: new Date()
            } as any
        });
    }
}

async function runTests() {
    console.log('=== Phase 19 Safety Verification ===');
    const config = SafetyConfigService.getInstance();

    // Reset Config
    config.setGlobalKillSwitch(false);
    config.setMode('ENFORCE');
    config.updateLimits({
        max_replies_per_day: 100,
        max_replies_per_video: 2, // Low limit for test
        max_replies_per_target_daily: 5,
        cooldown_hours: 0 // Disable cooldown for rate limit test
    });

    const uniqueSuffix = Date.now();
    const TEST_ACCT_ID = 'test_account_123';

    // Create Account for Main Test
    await prisma.account.upsert({
        where: { id: TEST_ACCT_ID },
        update: {},
        create: { id: TEST_ACCT_ID, status: 'ACTIVE' }
    });

    const TEST_TARGET = {
        platform: 'test_platform',
        target_id: `test_platform:safety_user_${uniqueSuffix}`,
        accountId: TEST_ACCT_ID
    };
    const TEST_VIDEO = `safety_video_${uniqueSuffix}`;

    // TEST 1: Normal Flow
    console.log('\n--- Test 1: Normal Flow ---');
    let preResult = await SafetyService.preCheck(TEST_TARGET);
    console.log('Pre-Check Allowed:', preResult.allowed);
    if (!preResult.allowed) throw new Error('Test 1 Failed');

    let postResult = await SafetyService.postCheck(TEST_TARGET, TEST_VIDEO, 'ANSWER');
    console.log('Post-Check Allowed:', postResult.allowed);
    if (!postResult.allowed) throw new Error('Test 1 Failed');

    // TEST 2: Trigger Video Rate Limit
    console.log('\n--- Test 2: Rate Limit Hit (Video) ---');
    // Seed 2 existing replies
    await seedReplies(TEST_TARGET.target_id, TEST_VIDEO, 2);

    postResult = await SafetyService.postCheck(TEST_TARGET, TEST_VIDEO, 'ANSWER');
    console.log('Post-Check (Should Fail):', !postResult.allowed);
    console.log('Reason:', postResult.reason);
    console.log('Downgrade:', postResult.override_strategy);

    if (postResult.allowed || postResult.override_strategy !== 'SILENT_CAPTURE') {
        throw new Error(`Test 2 Failed: Expected Block/Downgrade, got ${JSON.stringify(postResult)}`);
    }

    // TEST 3: Kill Switch
    console.log('\n--- Test 3: Kill Switch ---');
    config.setGlobalKillSwitch(true);
    preResult = await SafetyService.preCheck(TEST_TARGET);
    console.log('Pre-Check (Should Fail):', !preResult.allowed);
    console.log('Reason:', preResult.reason);

    if (preResult.allowed || preResult.override_strategy !== 'IGNORE') {
        throw new Error('Test 3 Failed');
    }
    config.setGlobalKillSwitch(false); // Reset

    // TEST 4: Cooldown
    console.log('\n--- Test 4: Cooldown ---');
    config.updateLimits({ cooldown_hours: 24 });
    // We already seeded replies moments ago, so cooldown should be active
    preResult = await SafetyService.preCheck(TEST_TARGET);
    console.log('Pre-Check (Should Fail Cooldown):', !preResult.allowed);
    console.log('Reason:', preResult.reason);

    if (preResult.allowed || !preResult.reason.includes('cooldown')) {
        throw new Error('Test 4 Failed');
    }


    // TEST 5: Account Aggregated Limits
    console.log('\n--- Test 5: Account Aggregated Limits ---');
    // Reset limits to simple state
    config.updateLimits({ max_replies_per_target_daily: 2 });

    const TARGET_ACCT_A = { platform: 'test', target_id: 'user_x', accountId: 'ACCT_A' };
    const TARGET_ACCT_B = { platform: 'test', target_id: 'user_x', accountId: 'ACCT_B' };

    // Create Accounts A and B (Upsert to be safe)
    await prisma.account.upsert({ where: { id: 'ACCT_A' }, update: {}, create: { id: 'ACCT_A', status: 'ACTIVE' } });
    await prisma.account.upsert({ where: { id: 'ACCT_B' }, update: {}, create: { id: 'ACCT_B', status: 'ACTIVE' } });

    // Seed 2 replies for ACCT_A (simulating Install 1)
    await seedReplies('user_x', 'video_z', 2, 'ACCT_A');

    // Check Install 2 (Same Account ACCT_A) -> Should be BLOCKED
    preResult = await SafetyService.preCheck(TARGET_ACCT_A);
    console.log('ACCT_A (Inst 2) Blocked:', !preResult.allowed);
    if (preResult.allowed) throw new Error('Test 5 Failed: Account A should be maxed out');

    // Check Install 3 (Different Account ACCT_B) -> Should be ALLOWED
    preResult = await SafetyService.preCheck(TARGET_ACCT_B);
    console.log('ACCT_B Allowed:', preResult.allowed);
    if (!preResult.allowed) throw new Error('Test 5 Failed: Account B should use separate counters');

    console.log('\n✅ All Safety Tests Passed!');
}

runTests().catch(console.error).finally(() => prisma.$disconnect());
