const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:3000';
const VALID_INSTALL_ID = 'test-install-id';
const VALID_TOKEN = 'test-token';
const INVALID_TOKEN = 'invalid-token';

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
                resolve({
                    status: res.statusCode,
                    body: data ? JSON.parse(data) : {}
                });
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

function getRequest(path) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE_URL}${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: data ? JSON.parse(data) : {}
                });
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('--- Phase 11 Automated Verification ---\n');
    let passed = 0;
    let failed = 0;

    async function assert(testName, promise, checkFn) {
        try {
            process.stdout.write(`Testing ${testName}... `);
            const result = await promise;
            if (checkFn(result)) {
                console.log('PASS');
                passed++;
            } else {
                console.log('FAIL');
                console.log('  Result:', JSON.stringify(result, null, 2));
                failed++;
            }
        } catch (e) {
            console.log('FAIL (Exception)');
            console.error(e);
            failed++;
        }
    }

    // Test 1: Health Check
    await assert('API Health Check', getRequest('/health'),
        res => res.status === 200 && res.body.status === 'ok');

    // Test 2: Valid Event Ingestion (P11-08, P11-09)
    const validEvent = {
        event_type: 'DESKTOP_CAPTURE',
        platform: 'youtube',
        session: { session_id: '56972242-ff7b-4029-a169-dc81c97a55ad', install_id: VALID_INSTALL_ID },
        page: { url: 'https://youtube.com/v/123', page_type: 'VIDEO', timestamp: new Date().toISOString() },
        video: { video_id: '123', video_url: 'https://youtube.com/v/123', title: 'Test', author_id: null, author_name: null },
        comment: { comment_id: 'c1', author_id: 'u1', author_name: null, text: 'test', like_count: 0, reply_count: 0 },
        context: { visible: true, position: 'viewport', user_action: 'manual_trigger' },
        client_meta: { extension_version: '1.0', browser: 'chrome', os: 'windows' }
    };

    await assert('Ingestion (Valid)', postRequest('/events', {
        'x-install-id': VALID_INSTALL_ID,
        'Authorization': `Bearer ${VALID_TOKEN}`
    }, validEvent),
        res => res.status === 200 && res.body.status === 'success' && res.body.recommendation.available === true);

    // Test 3: Invalid Auth (P11-17, P11-02)
    await assert('Ingestion (Invalid Token)', postRequest('/events', {
        'x-install-id': VALID_INSTALL_ID,
        'Authorization': `Bearer ${INVALID_TOKEN}`
    }, validEvent),
        res => res.status === 403);

    // Test 4: Schema Validation (P11-08)
    const invalidEvent = { ...validEvent, platform: 'unknown_platform' };
    await assert('Ingestion (Invalid Schema)', postRequest('/events', {
        'x-install-id': VALID_INSTALL_ID,
        'Authorization': `Bearer ${VALID_TOKEN}`
    }, invalidEvent),
        res => res.status === 400 && res.body.message === 'Validation failed');

    console.log(`\nResults: ${passed} PASSED, ${failed} FAILED`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
