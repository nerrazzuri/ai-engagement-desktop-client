const fs = require('fs');

const BASE = 'http://127.0.0.1:3000';
const HEADERS = {
    'Content-Type': 'application/json',
    'x-install-id': 'detector-local',
    'Authorization': 'Bearer token-for-detector-local'
};

async function runTest(file) {
    const test = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`\n▶ ${test.name}`);

    // 1. Send event
    // Use native fetch (Node 18+)
    const evRes = await fetch(`${BASE}/events`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(test.input)
    });

    const ev = await evRes.json();

    if (!ev.event_id) {
        // Log full error structure including Zod issues
        console.error('Event Creation Failed:', JSON.stringify(ev, null, 2));
        throw new Error('No event_id');
    }

    // 2. Request suggestion
    const sugRes = await fetch(`${BASE}/suggestions`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ event_id: ev.event_id })
    });

    const sug = await sugRes.json();

    if (sugRes.status !== 200) {
        console.error('Suggestion Failed:', JSON.stringify(sug, null, 2));
        throw new Error(`Suggestion API returned ${sugRes.status}`);
    }

    // 3. Assertions
    if (test.expect.strategy && sug._meta.strategy !== test.expect.strategy) {
        throw new Error(`Expected strategy ${test.expect.strategy}, got ${sug._meta.strategy}`);
    }

    if ('rag_used' in test.expect) {
        const used = sug._meta.rag?.used === true;
        if (used !== test.expect.rag_used) {
            throw new Error(`RAG usage mismatch. Expected ${test.expect.rag_used}, got ${used}`);
        }
    }

    if (test.expect.prompt_version && sug._meta.prompt_version !== test.expect.prompt_version) {
        throw new Error(`Expected prompt_version ${test.expect.prompt_version}, got ${sug._meta.prompt_version}`);
    }

    console.log('✔ PASSED');
}

(async () => {
    try {
        const files = fs.readdirSync('./tests/phase15').filter(f => f.endsWith('.json'));
        console.log(`Found ${files.length} test cases.`);

        for (const f of files) {
            await runTest(`./tests/phase15/${f}`);
        }
    } catch (err) {
        console.error('\n✖ TEST SUITE FAILED');
        console.error(err);
        process.exit(1);
    }
})();
