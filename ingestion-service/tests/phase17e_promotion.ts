
import { PromotionEngine } from '../src/engagement_promotion/promotion_engine';
import { EngagementSignal } from '../src/engagement_promotion/types';
import { EngagementOpportunity } from '../src/engagement_opportunity/types';

async function runTest() {
    console.log('--- PHASE 17E: PROMOTION ENGINE VERIFICATION ---');

    const makeSignal = (id: string, userId: string, stage: any, level: any, score: number, timeOffsetMinutes: number): EngagementSignal => {
        const ts = new Date();
        ts.setMinutes(ts.getMinutes() + timeOffsetMinutes);
        return {
            metadata: {
                comment_id: id,
                user_id: userId,
                video_id: 'v1',
                timestamp: ts.toISOString(),
                platform: 'test'
            },
            opportunity: {
                buying_stage: stage,
                opportunity_level: level,
                urgency_score: score,
                recommended_action: 'PUBLIC_REPLY',
                primary_intent: 'LATENT_PURCHASE',
                supporting_intents: [],
                explanation: { summary: 'test', signals: [], matched_phrases: [] }
            }
        };
    };

    // Scenario 1: Escalation
    // User A: Consideration (Score 40) at T0.
    // User A: Decision (Score 80) at T+5.
    // Expectation: 2nd signal boosted by Escalation (+20) + Repetition (+10) + Freq (+5) -> Score 100+ -> PROMOTED.
    const escalationSignals = [
        makeSignal('c1', 'user_a', 'CONSIDERATION', 'LOW', 40, 0),
        makeSignal('c2', 'user_a', 'DECISION', 'CRITICAL', 80, 5)
    ];

    console.log('\n--- Scenario 1: Escalation ---');
    const results1 = PromotionEngine.process(escalationSignals);
    const c2Result = results1.find(r => r.opportunity_id === 'c2');

    if (c2Result) {
        console.log(`C2 Score: ${c2Result.priority_score.toFixed(0)} (Base 80)`);
        console.log(`C2 Status: ${c2Result.status}`);
        console.log(`Context: AbsFreq=${c2Result.aggregation_context.frequency_score}, Escalation=${c2Result.aggregation_context.intent_escalation}`);

        if (c2Result.priority_score > 80 && c2Result.aggregation_context.intent_escalation) {
            console.log('[PASS] Escalation Boosted Priority');
        } else {
            console.error('[FAIL] Escalation logic failed');
        }
    }

    // Scenario 2: Suppression
    // User B: Awareness (Score 10-IGNORE).
    // Expectation: Suppressed.
    console.log('\n--- Scenario 2: Suppression ---');
    const suppressionSignal = [
        makeSignal('c3', 'user_b', 'AWARENESS', 'IGNORE', 10, 10)
    ];
    const results2 = PromotionEngine.process(suppressionSignal);

    if (results2[0].status === 'SUPPRESSED') {
        console.log(`[PASS] Low signal suppressed (${results2[0].priority_score})`);
    } else {
        console.error(`[FAIL] Expected SUPPRESSED, got ${results2[0].status}`);
    }

    // Scenario 3: Regret Bypass
    // User C: Regret (Score 45 - effectively LOW/MED).
    // Expectation: Promoted despite score < 80, because Stage=REGRET.
    console.log('\n--- Scenario 3: Regret Bypass ---');
    const regretSignal = [
        makeSignal('c4', 'user_c', 'REGRET', 'MEDIUM', 45, 15)
    ];
    const results3 = PromotionEngine.process(regretSignal);

    if (results3[0].status === 'PROMOTED') {
        console.log(`[PASS] Regret Promoted (Reason: ${results3[0].promotion_reason})`);
    } else {
        console.error(`[FAIL] Expected PROMOTED, got ${results3[0].status}`);
    }

    // Scenario 4: Spam Penalty
    // User D: 6 messages in window.
    // 6th message should have spam penalty.
    console.log('\n--- Scenario 4: Spam Penalty ---');
    const spamSignals = [];
    for (let i = 0; i < 6; i++) {
        spamSignals.push(makeSignal(`spam_${i}`, 'user_d', 'CONSIDERATION', 'LOW', 40, 20 + i));
    }
    const results4 = PromotionEngine.process(spamSignals);
    const lastSpam = results4.find(r => r.opportunity_id === 'spam_5');

    if (lastSpam) {
        console.log(`Spam Msg 6 Score: ${lastSpam.priority_score}`);
        // Base 40 + Repetition(10) + Freq(5*5=25) = 75.
        // Penalty = -50.
        // Result ~ 25.
        if (lastSpam.priority_score < 40) {
            console.log('[PASS] Spam Penalty Applied');
        } else {
            console.error(`[FAIL] Penalty check failed. Score: ${lastSpam.priority_score}`);
        }
    }

}

runTest().catch(console.error);
