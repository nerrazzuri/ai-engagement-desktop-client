
import { prisma } from '../../db';
import { Session, User, Account } from '@prisma/client';

const SESSION_TTL_HOURS = 24;

export class SessionStore {
    /**
     * Create a new session for a user.
     */
    static async createSession(userId: string, activeWorkspaceId?: string): Promise<Session> {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + SESSION_TTL_HOURS);

        return await prisma.session.create({
            data: {
                user_id: userId,
                active_workspace_id: activeWorkspaceId,
                expires_at: expiresAt
            }
        });
    }

    /**
     * Get session by token, validating expiry.
     * Deletes if expired.
     */
    static async getSession(token: string): Promise<Session & { user: User, active_workspace: Account | null } | null> {
        const session = await prisma.session.findUnique({
            where: { id: token },
            include: {
                user: true,
                active_workspace: true // Phase 19.7 Polish: Load workspace for status check
            }
        });

        if (!session) return null;

        // Check Expiry
        if (new Date() > session.expires_at) {
            await this.deleteSession(token);
            return null;
        }

        // Update Last Seen (Async, don't block)
        this.touchSession(token).catch(console.error);

        return session;
    }

    /**
     * Update last_seen_at
     */
    static async touchSession(token: string) {
        await prisma.session.update({
            where: { id: token },
            data: { last_seen_at: new Date() }
        });
    }

    /**
     * Delete session (Logout)
     */
    static async deleteSession(token: string) {
        await prisma.session.delete({
            where: { id: token }
        }).catch(() => { /* Ignore not found */ });
    }

    /**
     * Update active workspace context
     * (Does not create new session, just mutates state)
     */
    static async updateActiveWorkspace(token: string, workspaceId: string) {
        await prisma.session.update({
            where: { id: token },
            data: {
                active_workspace_id: workspaceId,
                last_seen_at: new Date() // Phase 19.7 Polish: Refresh session on switch
            }
        });
    }
}
