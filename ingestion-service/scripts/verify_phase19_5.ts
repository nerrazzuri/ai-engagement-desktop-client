
import { prisma } from '../src/db';
import { SafetyService } from '../src/services/safety/safety_service';
import { SafetyConfigService } from '../src/services/safety/config_service';

async function verify() {
    console.log('=== Phase 19.5 Verification Report ===');

    // 1. Setup Test Account
    const ACC_ID = `verify_acc_${Date.now()}`;
    await prisma.account.create({
        data: {
            id: ACC_ID,
            status: 'ACTIVE',
            plan: 'BASIC'
        }
    });
    console.log(`[OK] Created Account: ${ACC_ID}`);

    // 2. Insert Event with Account Scope
    const EVENT_ID = `evt_${Date.now()}`;
    const TARGET_ID = `user_${Date.now()}`;

    await prisma.engagementEvent.create({
        data: {
            id: EVENT_ID,
            dedup_key: EVENT_ID,
            platform: 'test',
            video_id: 'vid_1',
            comment_id: 'cmt_1', // Required Field
            content_text: 'hello',
            status: 'DONE',
            target_id: TARGET_ID,
            account_id: ACC_ID, // Critical Phase 19.5 Field
            created_at: new Date(),
            metadata: '{}'
        } as any
    });
    console.log(`[OK] Created EngagementEvent linked to Account`);

    // 3. Verify Safety Aggregation
    // Config: Max 1 reply per target
    SafetyConfigService.getInstance().updateLimits({ max_replies_per_target_daily: 1 });

    const targetProps = { platform: 'test', target_id: TARGET_ID, accountId: ACC_ID };

    // Check Limits - Should be BLOCKED (since we just inserted 1 DONE event)
    const result = await SafetyService.preCheck(targetProps);

    if (!result.allowed) {
        console.log(`[OK] Safety Check Blocked (Expected): ${result.reason}`);
    } else {
        console.error(`[FAIL] Safety Check Allowed? Reason: ${result.reason}`);
        process.exit(1);
    }

    // 4. Verify Isolation
    // Different Account, Same Target -> Should be ALLOWED
    const ACC_ID_2 = `verify_acc_2_${Date.now()}`;
    await prisma.account.create({ data: { id: ACC_ID_2, status: 'ACTIVE' } });

    const targetProps2 = { platform: 'test', target_id: TARGET_ID, accountId: ACC_ID_2 };
    const result2 = await SafetyService.preCheck(targetProps2);

    if (result2.allowed) {
        console.log(`[OK] Isolation Verified (Other Account Allowed)`);
    } else {
        console.error(`[FAIL] Isolation Failed. Other account blocked: ${result2.reason}`);
        process.exit(1);
    }

    console.log('\n✅ Phase 19.5 Verification COMPLETE');
}

verify().catch(e => {
    console.error('--- ERROR CAUGHT ---');
    console.error('Name:', e.name);
    console.error('Message:', e.message);
    console.error('Code:', e.code);
    console.error('Meta:', e.meta);
    console.error('Stack:', e.stack);
    console.error('Full:', JSON.stringify(e, null, 2));
    process.exit(1);
}).finally(() => prisma.$disconnect());
