import * as bcrypt from 'bcrypt';
import { prisma } from '../../db';
import { AdminUser, AdminSession } from '@prisma/client';
import { RateLimitService } from './rate_limiter';
import { config } from '../../config';

export class AdminAuthService {

    /**
     * Create initial superadmin (Dev helper)
     */
    static async ensureSuperAdmin(email: string, plain: string) {
        const existing = await prisma.adminUser.findUnique({ where: { email } });
        if (!existing) {
            const hash = await bcrypt.hash(plain, config.bcryptRounds);
            await prisma.adminUser.create({
                data: {
                    email,
                    password_hash: hash,
                    role: 'SUPERADMIN'
                }
            });
            console.log('[AdminAuth] SuperAdmin created:', email);
        }
    }

    /**
     * Admin Login
     */
    static async login(email: string, plain: string, ip: string): Promise<{ token: string, admin: AdminUser } | null> {
        // Shared IP Rate Limit with Users (strict)
        RateLimitService.check(ip);

        const admin = await prisma.adminUser.findUnique({
            where: { email }
        });

        if (!admin) {
            console.log('[AdminAuth] Not found:', email);
            RateLimitService.recordFail(ip);
            await new Promise(r => setTimeout(r, 500)); // Delay
            return null;
        }

        const valid = await bcrypt.compare(plain, admin.password_hash);
        if (!valid) {
            console.warn('[AdminAuth] Invalid password for', email);
            RateLimitService.recordFail(ip);
            await new Promise(r => setTimeout(r, 500)); // Delay
            return null;
        }

        RateLimitService.reset(ip);

        // Create Session
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
        const session = await prisma.adminSession.create({
            data: {
                admin_id: admin.id,
                expires_at: expiresAt
            }
        });

        return { token: session.id, admin };
    }

    static async validateSession(token: string): Promise<AdminUser | null> {
        const session = await prisma.adminSession.findUnique({
            where: { id: token },
            include: { admin: true }
        });

        if (!session) return null;
        if (session.expires_at < new Date()) {
            // Delete expired
            await prisma.adminSession.delete({ where: { id: token } }).catch(() => { });
            return null;
        }

        return session.admin;
    }

    static async logout(token: string) {
        await prisma.adminSession.delete({ where: { id: token } }).catch(() => { });
    }
}
