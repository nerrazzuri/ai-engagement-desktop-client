
import { prisma } from '../src/db';

async function seedDev() {
    console.log('--- SEEDING DEV ACCOUNT & INSTALL ---');

    // 1. Dev Account (Fixed ID)
    const ACC_ID = 'acct_dev_local';
    const account = await prisma.account.upsert({
        where: { id: ACC_ID },
        update: {
            status: 'ACTIVE',
            plan: 'dev'
        },
        create: {
            id: ACC_ID,
            status: 'ACTIVE',
            plan: 'dev'
        }
    });
    console.log(`[OK] Account Ready: ${account.id} (${account.status})`);

    // 2. Dev Install (Fixed ID)
    const INSTALL_ID = 'install_dev_interactive';
    const install = await prisma.installRegistry.upsert({
        where: { install_id: INSTALL_ID },
        update: {
            account_id: ACC_ID,
            is_active: true
        },
        create: {
            install_id: INSTALL_ID,
            account_id: ACC_ID,
            is_active: true
        }
    });

    console.log(`[OK] Install Ready: ${install.install_id} -> Account: ${install.account_id}`);

    console.log('\nDEV ACCOUNT READY');
    console.log(`account_id=${ACC_ID}`);
    console.log(`install_id=${INSTALL_ID}`);
}

seedDev()
    .catch(e => {
        console.error('Seed Failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
