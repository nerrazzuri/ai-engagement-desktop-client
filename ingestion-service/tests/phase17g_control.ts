
import { ControlOrchestrator } from '../src/engagement_control/control_orchestrator';
import { EngagementActionPlan } from '../src/engagement_action/types';
import { AuditLog } from '../src/engagement_control/audit_log';
import { ApprovalQueue } from '../src/engagement_control/approval_queue';

async function runTest() {
    console.log('--- PHASE 17G: CONTROL LAYER VERIFICATION ---');

    console.log('\n--- Setup: Cleaning Queue ---');
    ApprovalQueue.clear();
    AuditLog.clear();

    const plan1: EngagementActionPlan = {
        action_type: 'PUBLIC_REPLY',
        channel: 'COMMENT',
        priority: 80,
        requires_human_approval: true,
        reasoning: { opportunity_summary: 'High Intent', buying_stage: 'DECISION', urgency_score: 80, promotion_reason: 'Score' }
    };

    const plan2: EngagementActionPlan = {
        action_type: 'ESCALATE',
        channel: 'INTERNAL',
        priority: 100, // Higher priority
        requires_human_approval: true,
        reasoning: { opportunity_summary: 'Regret', buying_stage: 'REGRET', urgency_score: 100, promotion_reason: 'Stage' }
    };

    console.log('\n--- Scenario 1: Enqueue ---');
    const a1 = ControlOrchestrator.submitPlan(plan1);
    const a2 = ControlOrchestrator.submitPlan(plan2);

    const pending = ControlOrchestrator.getPendingActions();
    console.log(`Pending count: ${pending.length}`);
    if (pending.length === 2) {
        console.log('[PASS] Plans Enqueued');
    } else {
        console.error(`[FAIL] Expected 2 pending, got ${pending.length}`);
    }

    // Verify Sorting (Plan 2 is Prio 100, Plan 1 is Prio 80)
    if (pending[0].action_plan_id === a2.action_plan_id) {
        console.log('[PASS] Queue Sorted by Priority');
    } else {
        console.error('[FAIL] Queue sort failed');
    }

    console.log('\n--- Scenario 2: Approve ---');
    const decision1 = ControlOrchestrator.submitDecision(a2.action_plan_id, {
        decision: 'APPROVE',
        decided_by: 'oper_1',
        decided_at: new Date().toISOString()
    });

    if (decision1.execution_status === 'APPROVED') {
        console.log('[PASS] Action Approved');
    } else {
        console.error(`[FAIL] Expected APPROVED, got ${decision1.execution_status}`);
    }

    console.log('\n--- Scenario 3: Edit ---');
    const decision2 = ControlOrchestrator.submitDecision(a1.action_plan_id, {
        decision: 'EDIT',
        edited_message: 'Edited reply text.',
        decided_by: 'oper_1',
        decided_at: new Date().toISOString()
    });

    if (decision2.execution_status === 'APPROVED' && decision2.original_plan.draft_message === 'Edited reply text.') {
        console.log('[PASS] Action Edited & Approved');
    } else {
        console.error(`[FAIL] Edit failed. Status: ${decision2.execution_status}, Text: ${decision2.original_plan.draft_message}`);
    }

    console.log('\n--- Scenario 4: Audit Log ---');
    const logs = AuditLog.getLogs();
    console.log(`Log count: ${logs.length}`);
    // 2 QUEUED + 2 DECISIONS = 4
    if (logs.length === 4) {
        console.log('[PASS] Audit Logs Recorded');
    } else {
        console.error(`[FAIL] Expected 4 logs, got ${logs.length}`);
    }
}

runTest().catch(console.error);
