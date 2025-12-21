
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005'; // Internal Port
const INSTALL_ID = 'test-install-id';
const TOKEN = 'test-token';

const TEST_CASES = [
    // 4. Verification Cases (Phase 17H Signals)
    // 4. Verification Cases (Phase 17H Signals)
    {
        id: 'case_fit',
        text: 'This color fits my anniversary',
        expectedStrategy: 'SILENT_CAPTURE'
    },
    {
        id: 'case_latent',
        text: 'I’d buy this if smaller',
        expectedStrategy: 'SILENT_CAPTURE'
    },
    {
        id: 'req_1_prefer',
        text: 'I’d prefer a brighter one',
        expectedStrategy: 'SILENT_CAPTURE' // Latent
    },
    {
        id: 'req_2_perfect_if',
        text: 'Almost perfect, just not in this size',
        expectedStrategy: 'SILENT_CAPTURE' // Latent (perf=Eval? No, Latent prefers Conditional "not in this" + Size?)
        // "not in this" is PREFERENCE. "size" is ATTRIBUTE. 
        // Latent: PREFERENCE + (PROD OR (PRO+ATTR)).
        // "this"(PRO) + "size"(ATTR).
    },
    {
        id: 'req_3_daily',
        text: 'This seems suitable for daily use',
        expectedStrategy: 'SILENT_CAPTURE' // Fit
    },
    {
        id: 'req_4_gift',
        text: 'Looks appropriate for a gift',
        expectedStrategy: 'SILENT_CAPTURE' // Fit
    },
    {
        id: 'req_5_hype',
        text: 'This is nice! I want one!',
        expectedStrategy: 'IGNORE' // Noise (Praise + Want=no specific rule?)
    },
    {
        id: 'req_6_overkill',
        text: 'Feels overkill for my routine',
        expectedStrategy: 'OBSERVE_ONLY' // Unknown (Usage=Routine, but "overkill" not eval?)
    }
];

async function runValidation() {
    console.log("--- Starting Phase 17H Intelligence Validation ---");

    for (const test of TEST_CASES) {
        console.log(`\n[Test Case] ${test.id}: "${test.text}"`);

        // 1. Seed Event
        await prisma.engagementEvent.upsert({
            where: { id: test.id },
            update: { content_text: test.text, status: 'NEW' },
            create: {
                id: test.id,
                dedup_key: 'test_hash_' + test.id + Date.now(),
                platform: 'instagram',
                video_id: 'vid_demo',
                comment_id: 'cmt_demo',
                content_text: test.text,
                metadata: JSON.stringify({ video: { title: "Makeup Demo", author_name: "BeautyGuru" } }),
                status: 'NEW'
            }
        });

        // 2. Clear Session
        await prisma.suggestionSession.deleteMany({ where: { event_id: test.id } });

        // 3. Call API
        try {
            const res = await fetch(`${BASE_URL}/suggestions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-install-id': INSTALL_ID,
                    'Authorization': `Bearer ${TOKEN}`
                },
                body: JSON.stringify({ event_id: test.id })
            });

            const data = await res.json();
            const strategy = data._meta?.strategy || 'UNKNOWN';
            const intent = data._meta?.decision_trace?.rag_meta?.intent || 'UNKNOWN'; // Intent might be buried in trace, checking meta first

            console.log(`   -> Result Strategy: ${strategy}`);
            console.log(`   -> Explanation: ${data._meta?.explanation}`);

        } catch (err: any) {
            console.error(`   -> Failed: ${err.message}`);
        }
    }

    console.log("\n--------------------------------------------------");
    await prisma.$disconnect();
}

runValidation();
