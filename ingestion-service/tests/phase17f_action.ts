
import { ActionOrchestrator } from '../src/engagement_action/action_orchestrator';
import { PromotedEngagement } from '../src/engagement_promotion/types';

async function runTest() {
    console.log('--- PHASE 17F: ACTION ORCHESTRATOR VERIFICATION ---');

    const makeEngagement = (
        id: string,
        status: 'PROMOTED' | 'SUPPRESSED' | 'DEFERRED',
        platform: string,
        intent: any,
        stage: any,
        level: any,
        recAction: any
    ): PromotedEngagement => {
        return {
            opportunity_id: id,
            priority_score: 90,
            promotion_reason: 'Testing',
            status: status,
            recommended_action: recAction,
            aggregation_context: {} as any,
            signal: {
                metadata: {
                    comment_id: id,
                    video_id: 'v1',
                    timestamp: new Date().toISOString(),
                    platform: platform
                },
                opportunity: {
                    primary_intent: intent,
                    buying_stage: stage,
                    opportunity_level: level,
                    urgency_score: 90,
                    recommended_action: recAction,
                    supporting_intents: [],
                    explanation: { summary: '', signals: [], matched_phrases: [] }
                }
            }
        };
    };

    // Scenario 1: Regret -> Escalate (Critical)
    console.log('\n--- Scenario 1: Regret Escalation ---');
    const regret = makeEngagement('e1', 'PROMOTED', 'instagram', 'POST_PURCHASE_REGRET', 'REGRET', 'CRITICAL', 'ESCALATE');
    const plan1 = ActionOrchestrator.createPlan(regret);
    console.log(`Action: ${plan1.action_type}, Channel: ${plan1.channel}`);
    if (plan1.action_type === 'ESCALATE' && plan1.channel === 'INTERNAL') {
        console.log('[PASS] Regret Escalated');
    } else {
        console.error(`[FAIL] Expected ESCALATE, got ${plan1.action_type}`);
    }

    // Scenario 2: DM Constraint (YouTube blocks DM)
    console.log('\n--- Scenario 2: DM on YouTube ---');
    const ytDM = makeEngagement('e2', 'PROMOTED', 'youtube', 'HIGH_INTENT_PURCHASE', 'DECISION', 'CRITICAL', 'DM');
    const plan2 = ActionOrchestrator.createPlan(ytDM);
    console.log(`Original: DM -> Result: ${plan2.action_type} on ${plan2.channel}`);
    if (plan2.action_type === 'PUBLIC_REPLY' && plan2.channel === 'COMMENT') {
        console.log('[PASS] DM Downgraded to Reply on YouTube');
    } else {
        console.error(`[FAIL] Expected PUBLIC_REPLY, got ${plan2.action_type}`);
    }

    // Scenario 3: Regular DM (Instagram allows DM)
    console.log('\n--- Scenario 3: DM on Instagram ---');
    const igDM = makeEngagement('e3', 'PROMOTED', 'instagram', 'HIGH_INTENT_PURCHASE', 'DECISION', 'CRITICAL', 'DM');
    const plan3 = ActionOrchestrator.createPlan(igDM);
    if (plan3.action_type === 'DM') {
        console.log('[PASS] DM Allowed on Instagram');
    } else {
        console.error(`[FAIL] Expected DM, got ${plan3.action_type}`);
    }

    // Scenario 4: Template Selection
    console.log('\n--- Scenario 4: Template Selection ---');
    if (plan3.template_id?.includes('high_decision')) {
        console.log(`[PASS] Correct Template: ${plan3.template_id}`);
    } else {
        console.error(`[FAIL] Expected high_decision, got ${plan3.template_id}`);
    }

    // Scenario 5: Suppressed -> No Action
    console.log('\n--- Scenario 5: Suppressed Signal ---');
    const supp = makeEngagement('e4', 'SUPPRESSED', 'tiktok', 'SOCIAL', 'AWARENESS', 'IGNORE', 'IGNORE');
    const plan4 = ActionOrchestrator.createPlan(supp);
    if (plan4.action_type === 'NO_ACTION') {
        console.log('[PASS] Suppressed -> NO_ACTION');
    } else {
        console.error(`[FAIL] Expected NO_ACTION, got ${plan4.action_type}`);
    }
}

runTest().catch(console.error);
