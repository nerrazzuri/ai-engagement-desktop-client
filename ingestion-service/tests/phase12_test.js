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
            headers: {
                ...headers
            }
        };
        http.get(`${BASE_URL}${path}`, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        body: data ? JSON.parse(data) : {}
                    });
                } catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('--- Phase 12 End-to-End Verification ---\n');
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
    const validEvent = {
        event_type: 'DESKTOP_CAPTURE',
        platform: 'youtube',
        session: { session_id: '56972242-ff7b-4029-a169-dc81c97a55ad', install_id: VALID_INSTALL_ID },
        page: { url: 'https://youtube.com/v/123', page_type: 'VIDEO', timestamp: new Date().toISOString() },
        video: { video_id: '123_p12', video_url: 'https://youtube.com/v/123', title: 'Test', author_id: null, author_name: null },
        comment: { comment_id: 'c1_p12', author_id: 'u1', author_name: null, text: 'Phase 12 Test', like_count: 0, reply_count: 0 },
        context: { visible: true, position: 'viewport', user_action: 'manual_trigger' },
        client_meta: { extension_version: '1.0', browser: 'chrome', os: 'windows' }
    };

    let eventId = null;
    await assert('Ingest Event', postRequest('/events', {
        'x-install-id': VALID_INSTALL_ID,
        'Authorization': `Bearer ${VALID_TOKEN}`
    }, validEvent),
        res => {
            if (res.status === 200 && res.body.status === 'success') {
                eventId = res.body.event_id;
                return true;
            }
            return false;
        });

    if (!eventId) {
        console.error("Stopping: Failed to get event_id");
        process.exit(1);
    }

    // 2. Get Suggestion
    let sessionId = null;
    await assert('Get Suggestion', postRequest('/suggestions', {
        'x-install-id': VALID_INSTALL_ID,
        'Authorization': `Bearer ${VALID_TOKEN}`
    }, { event_id: eventId }),
        res => {
            if (res.status === 200 && res.body.session_id) {
                sessionId = res.body.session_id;
                return true;
            }
            return false;
        });

    // 3. Send Feedback
    await assert('Send Feedback (COPY)', postRequest('/feedback', {
        'x-install-id': VALID_INSTALL_ID,
        'Authorization': `Bearer ${VALID_TOKEN}`
    }, { session_id: sessionId, action: 'COPY', final_text: 'Used Text' }),
        res => res.status === 200 && res.body.status === 'success');

    // 4. Admin Queue Check
    await assert('Admin Queue View', getRequest('/admin/queue', {
        'x-install-id': VALID_INSTALL_ID,
        'Authorization': `Bearer ${VALID_TOKEN}`
    }),
        res => res.status === 200 && Array.isArray(res.body) && res.body.length > 0 && res.body[0].status === 'DONE');

    console.log(`\nResults: ${passed} PASSED, ${failed} FAILED`);
}

runTests();
