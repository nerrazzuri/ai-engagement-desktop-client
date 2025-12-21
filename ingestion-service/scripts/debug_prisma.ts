
import { PrismaClient } from '@prisma/client';
import { v4 } from 'uuid';

// Manual Enum Definition since import might fail
enum PlanId {
    FREE = 'FREE',
    PRO = 'PRO',
    BUSINESS = 'BUSINESS'
}

enum OnboardingState {
    CREATED = 'CREATED',
    FIRST_EVENT_INGESTED = 'FIRST_EVENT_INGESTED',
    FIRST_SUGGESTION_CREATED = 'FIRST_SUGGESTION_CREATED',
    FIRST_DECISION_MADE = 'FIRST_DECISION_MADE',
    ONBOARDED = 'ONBOARDED'
}

const prisma = new PrismaClient();

async function main() {
    console.log('--- DEBUG PRISMA CLIENT ---');
    try {
        const account = await prisma.account.create({
            data: {
                name: 'Debug Workspace',
                status: 'ACTIVE',
                plan: 'free',
                // @ts-ignore - Ignore type check in case d.ts is stale
                plan_id: 'FREE',
                // @ts-ignore
                onboarding_state: 'CREATED'
            }
        });
        console.log('Created Account:', JSON.stringify(account, null, 2));

        if (!account['onboarding_state']) {
            console.error('FAIL: onboarding_state is MISSING');
        } else {
            console.log('SUCCESS: onboarding_state is PRESENT');
        }

    } catch (e: any) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
