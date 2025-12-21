
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3005';
const INSTALL_ID = 'test-install-id';
const TOKEN = 'test-token';

async function runValidation() {
    console.log("--- Starting Intelligence Validation ---");

    // 1. Seed Event
    const eventId = 'evt_test_final';
    const text = 'Foundation & concealer from???'; // Product Source Query

    console.log(`[Seed] Creating/Updating Event: ${eventId}`);
    await prisma.engagementEvent.upsert({
        where: { id: eventId },
        update: { content_text: text, status: 'NEW' },
        create: {
            id: eventId,
            dedup_key: 'test_hash_' + Date.now(),
            platform: 'instagram',
            video_id: 'vid_demo',
            comment_id: 'cmt_demo',
            content_text: text,
            metadata: JSON.stringify({ video: { title: "Makeup Demo", author_name: "BeautyGuru" } }),
            status: 'NEW'
        }
    });

    // 2. Clear previous sessions for clean test
    await prisma.suggestionSession.deleteMany({ where: { event_id: eventId } });

    // 3. Call Suggestions API
    console.log(`[API] calling POST /suggestions for ${eventId}...`);
    try {
        const res = await fetch(`${BASE_URL}/suggestions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-install-id': INSTALL_ID,
                'Authorization': `Bearer ${TOKEN}`
            },
            body: JSON.stringify({ event_id: eventId })
        });

        console.log("\n--- RAW RESPONSE ---");
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
        console.log("--------------------\n");

    } catch (err: any) {
        console.error("API Call Failed:", err.message);
    } finally {
        await prisma.$disconnect();
    }
}

runValidation();
