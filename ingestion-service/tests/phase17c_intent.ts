
import { BrainGateway } from '../src/services/brain/brain_gateway';
import { CapabilityRequest } from '../src/core/contracts';

async function runTest() {
    console.log('--- PHASE 17C: INTENT SYSTEM VERIFICATION (Refined) ---');

    const runCase = async (input: string, expectedKind: string, expectedStrategy?: string) => {
        console.log(`\nTyping: "${input}"`);
        const req: CapabilityRequest = {
            version: 'v1',
            channel: 'test',
            tenant_id: 'test_tenant',
            input: { query: input },
            context: {
                raw_event: { content_text: input, platform: 'test', video_id: 'v1' }
            }
        };

        const res = await BrainGateway.processCapability(req);

        const payload = res.payload as any;
        const decisions = res.policy_decisions as any;
        const trace = decisions?.trace || {};

        if (trace.intent) console.log(`  -> Detected Intent: ${trace.intent}`);
        if (res.kind !== 'ignore' && payload.strategy) console.log(`  -> Strategy: ${payload.strategy}`);
        if (decisions?.explanation) console.log(`  -> Explain: ${decisions.explanation}`);

        if (res.kind !== expectedKind) {
            console.error(`  [FAIL] Expected kind '${expectedKind}', got '${res.kind}'`);
        } else if (expectedStrategy && payload.strategy !== expectedStrategy) {
            console.error(`  [FAIL] Expected strategy '${expectedStrategy}', got '${payload.strategy}'`);
        } else {
            console.log('  [PASS]');
        }
    };

    // 1. Social (Blocked)
    await runCase('I love it, cool video', 'ignore');

    // 2. High Intent (Forced Answer)
    await runCase('Where can I get the price link?', 'answer', 'ANSWER');

    // 3. Latent (Forced Answer)
    await runCase('Too dark for me, I prefer lighter ones', 'answer', 'ANSWER');

    // 4. Regret Aggregation (Mixed)
    // "I bought it" (Regret 10) + "broke" (Regret 15) = 25.
    // Winner: Regret.
    await runCase('I bought this and it broke', 'answer', 'ANSWER');

    // 5. Hostile vs Regret
    // "I bought" (Regret 10). "Hate" (Hostile 20).
    // Winner: Hostile (20 > 10).
    // Policy: Hostile -> DE_ESCALATE.
    await runCase('I bought this and hate it', 'answer', 'DE_ESCALATE');

    // 6. Normalization & Emoji
    // "looove" -> "love" (Social). "❤️" -> "love" (Social).
    // Total Social Score > 0.
    // Result: Blocked.
    await runCase('I loooveee it!!! ❤️', 'ignore');

    // 7. Emoji Only
    await runCase('🔥🔥🔥', 'ignore');
}

runTest().catch(console.error);
