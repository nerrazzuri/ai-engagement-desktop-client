
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005';
const INSTALL_ID = 'install_dev_interactive';
const TOKEN = 'test-token';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question: string): Promise<string> {
    return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
    console.log("==================================================");
    console.log("   AI Engagement - Interactive Intent Tester");
    console.log("==================================================");
    console.log("Type a comment to test detection. Type 'exit' to quit.\n");

    while (true) {
        const text = await ask("Comment > ");
        if (text.toLowerCase() === 'exit') break;
        if (!text.trim()) continue;

        const eventId = `test_interactive_${Date.now()}`;

        try {
            // 1. Seed Event via API (Ensure Docker DB Consistency)
            // Wait for ingestion to process (it's async background)
            const ingestRes = await fetch(`${BASE_URL}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-install-id': INSTALL_ID
                },
                body: JSON.stringify({
                    event_type: 'DESKTOP_CAPTURE',
                    platform: 'instagram',
                    session: {
                        session_id: '123e4567-e89b-12d3-a456-426614174000', // Mock UUID
                        install_id: INSTALL_ID
                    },
                    page: {
                        url: 'https://www.instagram.com/reel/test',
                        page_type: 'VIDEO',
                        timestamp: new Date().toISOString()
                    },
                    video: {
                        video_id: 'vid_test',
                        video_url: 'https://www.instagram.com/reel/test_vid',
                        title: 'Test Video',
                        author_id: 'user_123',
                        author_name: 'Tester'
                    },
                    comment: {
                        comment_id: `cmt_${eventId}`,
                        author_id: 'user_456',
                        author_name: 'Commenter',
                        text: text
                    },
                    context: {
                        visible: true,
                        position: 'viewport',
                        user_action: 'scroll'
                    },
                    client_meta: {
                        extension_version: '1.0.0',
                        browser: 'chrome',
                        os: 'windows'
                    }
                })
            });

            if (!ingestRes.ok) {
                console.log("   [ERROR] Ingestion Failed", await ingestRes.text());
                continue;
            }

            // Ingestion API is 202 Accepted (Async). Wait a bit for DB persistence.
            await new Promise(r => setTimeout(r, 2000));

            // We need to fetch the Event ID because Ingest API might generate one or we need to find it by dedup key?
            // Actually, ingest uses dedup keys. We can't easily guess the ID unless we pre-calc dedup or query queue.
            // Let's query the queue to find our event.

            // Helper: Find event by comment ID
            // For interactive test simplicity, we can just rely on the fact that we just sent it.
            // But API /suggestions requires ID.
            // Let's implement a 'find recent' or assume ID generation?
            // Wait, Ingest Logic: "dedup_key = sha256(...)".
            // We can replicate dedup key gen to find it in DB? No, script is avoiding DB.
            // Let's use `GET /admin/queue` to find the latest event.

            const queueRes = await fetch(`${BASE_URL}/admin/queue`, {
                headers: {
                    'x-install-id': INSTALL_ID,
                    'x-admin-key': 'mysupersecret', // Matches container env
                    'Authorization': `Bearer ${TOKEN}`
                }
            });
            if (!queueRes.ok) {
                console.log("   [ERROR] Failed to fetch queue:", await queueRes.text());
                continue;
            }
            const queueData = await queueRes.json();

            if (!Array.isArray(queueData)) {
                console.log("   [ERROR] Queue response is not an array:", JSON.stringify(queueData));
                continue;
            }

            const latestEvent = queueData.find((e: any) => e.comment_id === `cmt_${eventId}`);

            if (!latestEvent) {
                console.log("   [ERROR] Event not found in queue after ingest. Queue IDs: ", queueData.map((e: any) => e.comment_id));
                continue;
            }

            // 2. Call API
            const res = await fetch(`${BASE_URL}/suggestions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-install-id': INSTALL_ID,
                    'Authorization': `Bearer ${TOKEN}`
                },
                body: JSON.stringify({ event_id: latestEvent.id })
            });

            const data = await res.json();

            if (res.status === 200) {
                const meta = data._meta || {};
                console.log("\n   [BRAIN RESULT]");
                console.log(`   Strategy   : ${meta.strategy}`);
                console.log(`   Intent     : ${meta.decision_trace?.rag_meta?.intent || 'N/A'}`); // Or check trace for inferred intent
                // Explanation is often in meta
                console.log(`   Explanation: ${meta.explanation}`);
                console.log(`   Reply      : "${data.text}"`);

                // If there's extra info about signals (Phase 17H), try to print it
                // The API ingest.ts might not pass signals through _meta yet, but let's check decision_trace if available
                if (meta.rag && meta.rag.signals) {
                    console.log(`   Signals    : ${JSON.stringify(meta.rag.signals)}`);
                }
            } else {
                console.log("   [ERROR]", data);
            }

        } catch (err: any) {
            console.error("   [EXCEPTION]", err.message);
        }
        console.log("\n--------------------------------------------------");
    }

    await prisma.$disconnect();
    rl.close();
    process.exit(0);
}

main().catch(console.error);
