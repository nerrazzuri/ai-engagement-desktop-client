
import { OpportunityEngine } from '../src/engagement_opportunity/opportunity_engine';
import { IntentClassificationResult } from '../src/services/brain/types';

async function runTest() {
    console.log('--- PHASE 17D: ENGAGEMENT OPPORTUNITY ENGINE VERIFICATION ---');

    const runCase = (name: string, mockClass: any, text: string, expected: any) => {
        console.log(`\nCase: ${name}`);
        console.log(`Input: Intent=${mockClass.intent}, Text="${text}"`);

        const opportunity = OpportunityEngine.evaluate(mockClass as any, text, 'test_comment_id');

        console.log('Result:', JSON.stringify({
            level: opportunity.opportunity_level,
            stage: opportunity.buying_stage,
            score: opportunity.urgency_score,
            action: opportunity.recommended_action
        }, null, 2));

        let pass = true;
        if (expected.level && opportunity.opportunity_level !== expected.level) {
            console.error(`  [FAIL] Expected level ${expected.level}, got ${opportunity.opportunity_level}`);
            pass = false;
        }
        if (expected.action && opportunity.recommended_action !== expected.action) {
            console.error(`  [FAIL] Expected action ${expected.action}, got ${opportunity.recommended_action}`);
            pass = false;
        }
        if (expected.stage && opportunity.buying_stage !== expected.stage) {
            console.error(`  [FAIL] Expected stage ${expected.stage}, got ${opportunity.buying_stage}`);
            pass = false;
        }

        if (pass) console.log('  [PASS]');
    };

    // 1. High Intent Purchase (Price + Link + Urgency)
    // Base 80 (High Intent) + 15 (Urgency "now") = 95 -> CRITICAL.
    // Stage: DECISION. Action: DM.
    runCase('High Intent + Urgency', {
        intent: 'HIGH_INTENT_PURCHASE',
        confidence: 0.9,
        detected_intents: [{ intent: 'HIGH_INTENT_PURCHASE', score: 50, families: ['price'] }],
        strength: 'high',
        evidence: { matched_signals: ['price'], matched_families: [], scores: {} as any, language: 'en' }
    }, 'Where can I get the price link now?', {
        level: 'CRITICAL',
        stage: 'DECISION',
        action: 'DM'
    });

    // 2. Latent Purchase (Hesitation)
    // Base 50 (Latent) - 10 (Hesitation "maybe") = 40 -> MEDIUM.
    // Stage: CONSIDERATION. Action: PUBLIC_REPLY.
    runCase('Latent + Hesitation', {
        intent: 'LATENT_PURCHASE',
        confidence: 0.7,
        detected_intents: [],
        strength: 'medium',
        evidence: { matched_signals: [], matched_families: [], scores: {} as any, language: 'en' }
    }, 'Maybe I will buy it later', {
        level: 'LOW', // 40 is max of LOW (21-40). Wait.
        // Scorer: if (score > 40) MEDIUM. So 41+ is MEDIUM. 40 is LOW.
        // Correct.
        action: 'PUBLIC_REPLY',
        stage: 'CONSIDERATION'
    });

    // 3. Regret (Broken)
    // Base 90 (Regret). No modifiers. = 90 -> CRITICAL.
    // Stage: REGRET. Action: ESCALATE.
    runCase('Regret / Broken', {
        intent: 'POST_PURCHASE_REGRET',
        confidence: 0.95,
        detected_intents: [],
        strength: 'high',
        evidence: { matched_signals: [], matched_families: [], scores: {} as any, language: 'en' }
    }, 'It broke immediately', {
        level: 'CRITICAL',
        stage: 'REGRET',
        action: 'ESCALATE'
    });

    // 4. Hostile (Buying Stage Override -> Regret)
    // Base 60 (Hostile).
    // Scorer: 60 -> MEDIUM (41-60).
    // Mapper: Hostile -> REGRET stage (Rule 2).
    // Policy: MEDIUM + REGRET -> DM.
    runCase('Hostile Engagement', {
        intent: 'HOSTILE',
        confidence: 0.8,
        detected_intents: [],
        strength: 'high',
        evidence: { matched_signals: [], matched_families: [], scores: {} as any, language: 'en' }
    }, 'This is stupid', {
        level: 'MEDIUM',
        stage: 'REGRET',
        action: 'DM'
    });

    // 5. Social (Low Value)
    // Base 10.
    // Score 10 -> IGNORE (0-20).
    // Action IGNORE.
    runCase('Social Praise', {
        intent: 'SOCIAL',
        confidence: 0.9,
        detected_intents: [],
        strength: 'high',
        evidence: { matched_signals: [], matched_families: [], scores: {} as any, language: 'en' }
    }, 'Cool video', {
        level: 'IGNORE',
        action: 'IGNORE'
    });
}

runTest().catch(console.error);
