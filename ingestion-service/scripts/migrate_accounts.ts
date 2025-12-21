import { prisma } from '../src/db';

async function migrate() {
    console.log('=== Phase 19.5 Account Migration ===');

    // 1. Migrate Installs & Create Accounts
    console.log('\n--- 1. Migrating Installs ---');
    const installs = await prisma.installRegistry.findMany({
        where: { account_id: null }
    });

    console.log(`Found ${installs.length} orphaned installs.`);

    for (const install of installs) {
        // Create Account
        const account = await prisma.account.create({
            data: {
                status: 'ACTIVE',
                plan: 'MIGRATED_BASIC'
            }
        });

        // Link Install
        await prisma.installRegistry.update({
            where: { id: install.id },
            data: { account_id: account.id }
        });

        console.log(`[Migrated] Install ${install.install_id} -> Account ${account.id}`);
    }

    // 2. Migrate Events (Backfill account_id)
    console.log('\n--- 2. Migrating Engagement Events ---');
    // Batch process to avoid memory issues (though we simply fetch all for this script/scale)
    const events = await prisma.engagementEvent.findMany({
        where: { account_id: null },
        take: 1000 // Limit for now or loop? Assume small dev db.
    });

    console.log(`Found ${events.length} events needing backfill.`);

    let validCount = 0;
    let skippedCount = 0;

    for (const event of events) {
        let installId: string | undefined;

        // Try to verify install_id from metadata
        if (event.metadata) {
            try {
                const meta = JSON.parse(event.metadata);
                // Check common paths for install_id in raw event
                // DesktopCaptureEvent: session.install_id? Or directly at root?
                // Checking Schema: session.install_id is the standard place.
                if (meta.session && meta.session.install_id) {
                    installId = meta.session.install_id;
                }
                // Legacy: root install_id?
                else if (meta.install_id) {
                    installId = meta.install_id;
                }
            } catch (e) {
                // Ignore parse error
            }
        }

        if (installId) {
            // Find Account via Install
            const install = await prisma.installRegistry.findUnique({
                where: { install_id: installId },
                include: { account: true }
            });

            if (install && install.account_id) {
                await prisma.engagementEvent.update({
                    where: { id: event.id },
                    data: {
                        account_id: install.account_id,
                        install_id: installId
                    }
                });
                validCount++;
                //   process.stdout.write('.');
            } else {
                skippedCount++;
                console.warn(`[Skip] Install ${installId} not found/linked for Event ${event.id}`);
            }
        } else {
            skippedCount++;
            // console.warn(`[Skip] No install_id in metadata for Event ${event.id}`);
        }
    }

    console.log(`\n\nMigration Complete.`);
    console.log(`Installs Migrated: ${installs.length}`);
    console.log(`Events Backfilled: ${validCount}`);
    console.log(`Events Skipped: ${skippedCount}`);
}

migrate()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
