
import { prisma } from '../src/db';
import { AuthService } from '../src/services/auth/auth_service';

async function seedUser() {
    console.log('--- SEEDING DEV USER ---');
    const EMAIL = 'dev@example.com';
    const PASSWORD = 'password123';

    const hash = await AuthService.hashPassword(PASSWORD);

    const user = await prisma.user.upsert({
        where: { email: EMAIL },
        update: {
            password_hash: hash,
            status: 'ACTIVE'
        },
        create: {
            email: EMAIL,
            password_hash: hash,
            status: 'ACTIVE'
        }
    });

    console.log(`[OK] User Ready: ${user.email} (ID: ${user.id})`);
}

seedUser()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
