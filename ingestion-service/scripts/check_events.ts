
import { prisma } from '../src/db';

async function main() {
    console.log('--- Checking Events ---');
    const count = await prisma.engagementEvent.count();
    console.log(`Total Events: ${count}`);

    const events = await prisma.engagementEvent.findMany({
        orderBy: { created_at: 'desc' },
        take: 10,
        include: { sessions: true }
    });

    console.log('Top 10 Events:', JSON.stringify(events, null, 2));

    console.log('--- Checking Suggestions ---');
    const suggestions = await prisma.suggestion.findMany({
        orderBy: { created_at: 'desc' },
        take: 10
    });
    console.log('Top 10 Suggestions:', JSON.stringify(suggestions, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
