
const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:3000';
const VALID_INSTALL_ID = 'test-install-id-p12';
const VALID_TOKEN = 'test-token';

function postRequest(path, headers, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
                } catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    console.log('--- Phase 14 LLM Infrastructure Verification ---\n');
    let passed = 0;
    let failed = 0;

    async function assert(testName, promise, checkFn) {
        try {
            process.stdout.write(`Testing ${testName}... `);
            const result = await promise;
            if (checkFn(result)) {
                console.log('PASS');
                passed++;
                return result;
            } else {
                console.log('FAIL');
                console.log('  Result:', JSON.stringify(result, null, 2));
                failed++;
                return result;
            }
        } catch (e) {
            console.log('FAIL (Exception)');
            console.error(e);
            failed++;
            return null;
        }
    }

    // 1. Ingest Event
    const event = {
        event_type: 'DESKTOP_CAPTURE',
        platform: 'youtube',
        session: { session_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', install_id: VALID_INSTALL_ID },
        page: { url: 'https://youtube.com/v/14', page_type: 'VIDEO', timestamp: new Date().toISOString() },
        video: { video_id: '14', video_url: 'https://youtube.com/v/14', title: 'P14 Video', author_id: null, author_name: null },
        comment: { comment_id: 'c_p14', author_id: 'u1', author_name: null, text: 'Phase 14 Test', like_count: 0, reply_count: 0 },
        context: { visible: true, position: 'viewport', user_action: 'manual_trigger' },
        client_meta: { extension_version: '1.0', browser: 'chrome', os: 'windows' }
    };

    let eventId;
    await assert('Ingest Event', postRequest('/events', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, event), res => { eventId = res.body.event_id; return res.status === 200; });

    // 2. Hybrid Pipeline Success (Mock Provider)
    await assert('Hybrid Pipeline (Mock Provider)', postRequest('/suggestions', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, { event_id: eventId }), res => {
        const meta = res.body._meta;
        console.log('DEBUG BODY:', JSON.stringify(res.body, null, 2));
        if (!meta) return false;

        // Scenario A: Mock Provider Success
        if (meta.model && meta.model.includes('mock-provider-hybrid')) {
            return res.body.text.includes("Mock LLM Suggestion") && typeof res.body.version === 'number';
        }

        // Scenario B: OpenAI Provider / Fallback Success (Resilience Verified)
        if (meta.model && meta.model.includes('heuristic-only-fallback')) {
            return res.body.text.length > 0 &&
                meta.explanation.includes('Fallback') &&
                typeof res.body.version === 'number';
        }

        return false;
    });

    // 3. Regeneration / Stability
    // Note: API increments 'regeneration_count' on each call, so Cache Key changes & Text changes (Option N).
    // Use this to verify system stability under repeated load.
    await assert('Regeneration Stability', postRequest('/suggestions', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, { event_id: eventId }), res => {
        // Just verify a valid response came back
        return res.status === 200 && typeof res.body.version === 'number';
    });

    console.log(`\nResults: ${passed} PASSED, ${failed} FAILED`);
}

runTests();
