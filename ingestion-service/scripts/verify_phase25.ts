
import { PrismaClient } from '@prisma/client';
import * as uuid from 'uuid';
import { AutomationPolicy } from '../src/services/automation/automation_policy';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3005';
const FETCH_OPTS = {
    headers: { 'Content-Type': 'application/json' }
};

async function main() {
    console.log('\n--- VERIFYING PHASE 25 (Automation Eligibility) ---');

    // 1. Setup: Create Workspace (Default Plan: FREE)
    const account = await prisma.account.create({
        data: {
            name: "Phase25_Test",
            status: "ACTIVE",
            plan_id: "FREE"
        }
    });

    await prisma.ownerSettings.create({
        data: {
            workspace_id: account.id,
            mode: 'OBSERVE_ONLY',
            automation_opt_in: false,
            // Required defaults since we are bypassing service
            aggressiveness: 'CONSERVATIVE',
            enable_intents: '{}',
            platforms_enabled: '[]'
        }
    });

    // Re-fetch to get included settings (and verify type safety)
    const accountWithSettings = await prisma.account.findUnique({
        where: { id: account.id },
        include: { owner_settings: true }
    });

    if (!accountWithSettings) throw new Error("Creation failed");

    console.log(`[Setup] Workspace: ${accountWithSettings.id}, Plan: ${accountWithSettings.plan_id}, OptIn: ${accountWithSettings.owner_settings?.automation_opt_in}`);

    // Create Event & Suggestion (Base)
    const event = await prisma.engagementEvent.create({
        data: {
            dedup_key: uuid.v4(),
            platform: 'youtube',
            video_id: 'vid_25',
            comment_id: 'c_25',
            content_text: 'Hello',
            status: 'NEW',
            account_id: account.id
        }
    });

    const suggestion = await prisma.suggestion.create({
        data: {
            workspace_id: account.id,
            event_id: event.id,
            platform: 'youtube',
            video_id: 'vid_25',
            suggested_text: 'Hi there',
            strategy: 'ANSWER',
            confidence: 0.95, // High confidence initially
            signals: '{}',
            owner_settings_snapshot: '{}',
            context_type: 'OWNED_CONTENT', // Correct context
            speaker_role: 'OWNER'         // Correct role
        }
    });

    // Helper to Check Eligibility
    async function checkEligibility(suggId: string): Promise<any> {
        const res = await fetch(`${API_URL}/automation/eligibility`, {
            method: 'POST',
            ...FETCH_OPTS,
            body: JSON.stringify({ suggestion_id: suggId })
        });
        return await res.json();
    }

    // TEST 1: Default Block (Reason: Plan FREE, OptIn FALSE)
    console.log('\n[Test 1] Default Block');
    let decision = await checkEligibility(suggestion.id);
    console.log('Result:', JSON.stringify(decision));
    if (decision.allowed === true) throw new Error('Failed: Allowed on Default');
    if (!decision.reasons.find((r: string) => r.includes('Plan'))) throw new Error('Failed: Missing Plan Reason');
    if (!decision.reasons.find((r: string) => r.includes('Automation is not enabled'))) throw new Error('Failed: Missing Opt-In Reason');

    // TEST 2: Plan Gate (Upgrade Plan, Keep OptIn FALSE)
    console.log('\n[Test 2] Plan Gate (Business Plan, OptIn False)');
    await prisma.account.update({ where: { id: account.id }, data: { plan_id: 'BUSINESS' } }); // Upgrade
    decision = await checkEligibility(suggestion.id);
    console.log('Result:', JSON.stringify(decision));
    if (decision.allowed === true) throw new Error('Failed: Allowed without Opt-In');
    if (decision.reasons.some((r: string) => r.includes('Plan'))) throw new Error('Failed: Plan should be valid now');
    if (!decision.reasons.some((r: string) => r.includes('Automation is not enabled'))) throw new Error('Failed: Missing Opt-In Reason');

    // TEST 3: Opt-In Gate (Enable OptIn, Break Context)
    console.log('\n[Test 3] Context Gate (OptIn True, Bad Context)');
    await prisma.ownerSettings.update({ where: { workspace_id: account.id }, data: { automation_opt_in: true } });

    // Break Context
    await prisma.suggestion.update({
        where: { id: suggestion.id },
        data: { context_type: 'COMPETITOR_CONTENT' }
    });

    decision = await checkEligibility(suggestion.id);
    console.log('Result:', JSON.stringify(decision));
    if (decision.allowed === true) throw new Error('Failed: Allowed with Bad Context');
    if (!decision.reasons.find((r: string) => r.includes('Context'))) throw new Error('Failed: Missing Context Reason');

    // TEST 4: Trust Gate (Fix Context, Check History)
    console.log('\n[Test 4] Trust Gate (Good Context, No History)');
    await prisma.suggestion.update({
        where: { id: suggestion.id },
        data: { context_type: 'OWNED_CONTENT' } // Restore
    });

    decision = await checkEligibility(suggestion.id);
    console.log('Result:', JSON.stringify(decision));
    if (decision.allowed === true) throw new Error('Failed: Allowed without History');
    if (!decision.reasons.some((r: string) => r.includes('history'))) throw new Error('Failed: Missing History Reason');

    // TEST 5: Success Case (Seed History)
    console.log('\n[Test 5] Success Case (Seeding History...)');

    // Create 20 Approved Decisions
    const user = await prisma.user.create({ data: { email: `u_${uuid.v4()}@test.com`, password_hash: 'x' } });

    // Bulk create 25 approvals
    const decisionsData = Array(25).fill(0).map(() => ({
        suggestion_id: suggestion.id, // technically one suggestion can have multiple decisions if multiple users? 
        // Or unique constraint? No unique on suggestion_id in schema shown.
        workspace_id: account.id,
        user_id: user.id,
        decision: 'APPROVE'
    }));

    // Prisma createMany is not supported in SQLite? It IS supported in newer versions.
    // If not, use loop.
    for (const d of decisionsData) {
        await prisma.suggestionDecision.create({ data: d });
    }

    decision = await checkEligibility(suggestion.id);
    console.log('Result:', JSON.stringify(decision));

    if (decision.allowed !== true) {
        console.error('Reasons:', decision.reasons);
        throw new Error('Failed: Should be Allowed now');
    }

    // TEST 6: Persistence Check
    console.log('\n[Test 6] Persistence Check');
    const updatedSugg = await prisma.suggestion.findUnique({ where: { id: suggestion.id } });
    if (updatedSugg?.automation_eligible !== true) throw new Error('DB Persistence Failed: eligible');
    if (!updatedSugg?.automation_reasons?.includes('[]')) {
        // Empty array serialized
        console.log('DB Reasons:', updatedSugg?.automation_reasons);
        // It might be "[]" string.
        if (updatedSugg?.automation_reasons !== '[]') throw new Error('DB Persistence Failed: reasons');
    }

    console.log('\nSUCCESS: Phase 25 Verified.');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
