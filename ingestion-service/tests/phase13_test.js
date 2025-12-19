
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
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        body: data ? JSON.parse(data) : {}
                    });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

function getRequest(path, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { ...headers }
        };
        http.get(`${BASE_URL}${path}`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
                } catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('--- Phase 13 Intelligence Verification ---\n');
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

    // 1. Ingest Event (Baseline)
    // We use a specific ID to force "PROFESSIONAL" tone (even length) per key % 2 logic
    // Using valid v4 UUIDs
    const profEvent = {
        event_type: 'DESKTOP_CAPTURE',
        platform: 'youtube',
        session: { session_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', install_id: VALID_INSTALL_ID },
        page: { url: 'https://youtube.com/v/12', page_type: 'VIDEO', timestamp: new Date().toISOString() },
        video: { video_id: '12', video_url: 'https://youtube.com/v/12', title: 'Prof Video', author_id: null, author_name: null },
        comment: { comment_id: 'c_prof', author_id: 'u1', author_name: null, text: 'What is the price?', like_count: 0, reply_count: 0 },
        context: { visible: true, position: 'viewport', user_action: 'manual_trigger' },
        client_meta: { extension_version: '1.0', browser: 'chrome', os: 'windows' }
    };

    // Casual Event (different UUID)
    // Logic: event.video_id.length % 2 === 0 ? 'PROFESSIONAL' : 'CASUAL'
    // '12'.length = 2 -> Professional (Correct)
    // '123'.length = 3 -> Casual (Correct)
    const casualEvent = {
        ...profEvent,
        session: { ...profEvent.session, session_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' },
        video: { ...profEvent.video, video_id: '123' },
        comment: { ...profEvent.comment, comment_id: 'c_cas_fresh', text: 'Hey, what is this?' }
    };

    let profEventId, casualEventId;

    await assert('Ingest Professional Context Event', postRequest('/events', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, profEvent), res => { profEventId = res.body.event_id; return res.status === 200; });

    await assert('Ingest Casual Context Event', postRequest('/events', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, casualEvent), res => { casualEventId = res.body.event_id; return res.status === 200; });

    // 2. Verify Context Awareness
    // Professional: "Thank you for the question..."
    // Casual: "Hey! Great question..."
    // Strategy: Both should be ANSWER because of "What"

    await assert('Strategy: Professional Tone Implementation', postRequest('/suggestions', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, { event_id: profEventId }), res => {
        const text = res.body.text;
        const meta = res.body._meta;
        return text.includes("Thank you") && meta.strategy === 'ANSWER';
    });

    await assert('Strategy: Casual Tone Implementation', postRequest('/suggestions', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, { event_id: casualEventId }), res => {
        const text = res.body.text;
        const meta = res.body._meta;
        return text.includes("Hey!") && meta.strategy === 'ANSWER';
    });

    // 3. Verify Determinism
    // Calling Suggestion again on Prof should yield same text (plus version suffix maybe, but core logic is same)
    // Actually, PromptComposer appends version, but strategy is same.

    await assert('Determinism: Same Strategy Selected', postRequest('/suggestions', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, { event_id: profEventId }), res => {
        return res.body._meta.strategy === 'ANSWER' && res.body.version > 1;
    });

    // 4. Verify Metadata Persistence (Audit)
    await assert('Audit: Metadata Persisted', getRequest('/admin/queue', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }), res => {
        const item = res.body.find(e => e.id === profEventId);
        if (!item || !item.sessions || item.sessions.length === 0) return false;

        const lastSession = item.sessions[item.sessions.length - 1];
        const meta = JSON.parse(lastSession.brain_meta);

        return meta.strategy === 'ANSWER' && meta.model === 'heuristic-v13' && meta.trace;
    });

    console.log(`\nResults: ${passed} PASSED, ${failed} FAILED`);
}

runTests();
