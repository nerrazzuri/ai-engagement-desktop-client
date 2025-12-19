
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
    console.log('--- Phase 15 RAG Integration Verification ---\n');
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

    // 1. Ingest Event (trigger Question -> ANSWER -> RAG)
    const questionEvent = {
        event_type: 'DESKTOP_CAPTURE',
        platform: 'youtube',
        session: { session_id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', install_id: VALID_INSTALL_ID },
        page: { url: 'https://youtube.com/v/15', page_type: 'VIDEO', timestamp: new Date().toISOString() },
        video: { video_id: '15', video_url: 'https://youtube.com/v/15', title: 'P15 Video', author_id: null, author_name: null },
        comment: { comment_id: 'c_p15_q', author_id: 'u1', author_name: null, text: 'What is the price?', like_count: 0, reply_count: 0 },
        context: { visible: true, position: 'viewport', user_action: 'manual_trigger' },
        client_meta: { extension_version: '1.0', browser: 'chrome', os: 'windows' }
    };

    let qEventId;
    await postRequest('/events', { 'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}` }, questionEvent)
        .then(res => qEventId = res.body.event_id);

    // 2. Verify RAG Execution for Question
    await assert('RAG Triggered for Question', postRequest('/suggestions', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, { event_id: qEventId }), res => {
        console.log('DEBUG RES:', JSON.stringify(res.body, null, 2));
        const meta = res.body._meta;
        // Should use V3 because input "price" triggers MockRag strategy ANSWER + Keyword match
        // If fallback occurs (due to missing OpenAI key), prompt_version might be undefined, but rag.used should be true.
        const ragSuccess = meta.rag && (meta.rag.confidence > 0 || meta.rag.used === true);
        const promptSuccess = meta.prompt_version === 'v3.0';
        const fallbackSuccess = meta.model && meta.model.includes('fallback') && ragSuccess;

        return promptSuccess || fallbackSuccess;
    });

    // 3. Ingest Event (trigger Praise -> ACKNOWLEDGE -> NO RAG)
    const praiseEvent = {
        ...questionEvent,
        session: { ...questionEvent.session, session_id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55' },
        video: { ...questionEvent.video, video_id: '16' }, // Correctly merge properties
        comment: { ...questionEvent.comment, comment_id: 'c_p15_p', text: 'Great video!', author_id: 'u2' }
    };

    // console.log('Creating Praise Event...');
    const pRes = await postRequest('/events', { 'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}` }, praiseEvent);
    // console.log('Praise Event Response:', JSON.stringify(pRes));
    let pEventId = pRes.body.event_id;
    // console.log('pEventId:', pEventId);

    await assert('RAG Skipped for Praise', postRequest('/suggestions', {
        'x-install-id': VALID_INSTALL_ID, 'Authorization': `Bearer ${VALID_TOKEN}`
    }, { event_id: pEventId }), res => {
        if (!res.body._meta) {
            console.log('FAIL DEBUG: Missing _meta. Status:', res.status, 'Body:', JSON.stringify(res.body));
            return false;
        }
        const meta = res.body._meta;
        const pass = meta.prompt_version !== 'v3.0' && (!meta.rag || meta.rag.used === false);
        if (!pass) {
            console.log('FAIL DEBUG: Meta content:', JSON.stringify(meta, null, 2));
        }
        return pass;
    });

    console.log(`\nResults: ${passed} PASSED, ${failed} FAILED`);
}

runTests();
