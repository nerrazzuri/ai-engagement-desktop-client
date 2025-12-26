import * as bcrypt from 'bcrypt';
import { config } from '../../config';
import { prisma } from '../../db';
import { SessionStore } from './session_store';
import { User, Account, Prisma } from '@prisma/client';
import { RateLimitService } from './rate_limiter';

export class AuthService {
    /**
     * Hash password for storage (Bcrypt)
     */
    static async hashPassword(plain: string): Promise<string> {
        return await bcrypt.hash(plain, config.bcryptRounds);
    }

    /**
     * Verify password against hash
     */
    static async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await bcrypt.compare(plain, hash);
    }

    /**
     * Login user with email/password.
     * Returns session token if successful.
     */
    static async login(email: string, plain: string, ip: string): Promise<{ token: string, user: User, activeWorkspaceId: string | null } | null> {
        // 1. IP Throttling
        RateLimitService.check(ip);

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user || user.status !== 'ACTIVE') {
            console.log('[Auth] User not found or inactive:', email);
            RateLimitService.recordFail(ip); // Count as fail to prevent enumeration
            return null;
        }

        // 2. User Lockout Check
        if (user.locked_until && user.locked_until.getTime() > Date.now()) {
            throw new Error('Account locked due to too many failed attempts.');
        }

        console.log(`[Auth] Verifying for ${email}. using Bcrypt...`);
        let valid = false;
        try {
            valid = await this.verifyPassword(plain, user.password_hash);
        } catch (e) {
            console.error('[Auth] Password verify error:', e);
        }

        if (!valid) {
            // Increment Failed Attempts
            RateLimitService.recordFail(ip);

            const attempts = user.login_attempts + 1;

            const updateData: Prisma.UserUpdateInput = { login_attempts: attempts };

            if (attempts >= 5) {
                updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
                updateData.login_attempts = 0; // Reset counter after lock? Or keep it? Usually reset after timeout.
                console.warn(`[Auth] Locking account ${email} for 15m`);
            }

            await prisma.user.update({ where: { id: user.id }, data: updateData });

            // Artificial Delay to slow down brute force
            await new Promise(r => setTimeout(r, 500));

            return null;
        }

        // Success
        RateLimitService.reset(ip);

        // Reset counters
        await prisma.user.update({
            where: { id: user.id },
            data: {
                login_attempts: 0, // Reset
                locked_until: null, // Clear Lock
                last_login_at: new Date()
            }
        });

        // 3. Workspace Resolution (Persistent Session Preference)
        let activeWorkspaceId: string | null = null;

        const memberships = await prisma.workspaceMembership.findMany({
            where: { user_id: user.id, status: 'ACTIVE' },
            take: 2
        });

        if (memberships.length === 1) {
            activeWorkspaceId = memberships[0].workspace_id;
        }

        const session = await SessionStore.createSession(user.id, activeWorkspaceId || undefined);

        return {
            token: session.id,
            user,
            activeWorkspaceId: session.active_workspace_id
        };
    }

    /**
     * Logout (Destroy Session)
     */
    static async logout(token: string) {
        await SessionStore.deleteSession(token);
    }
}
