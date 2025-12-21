
import { prisma } from '../../db';

export class WorkspaceService {

    /**
     * Create a new Workspace (Account) and assign creator as OWNER.
     * returns the new Account.
     */
    static async createWorkspace(userId: string, name: string) {
        // Transaction to ensure atomicity
        return await prisma.$transaction(async (tx) => {
            // 1. Create Account
            const account = await tx.account.create({
                data: {
                    name,
                    status: 'ACTIVE',
                    plan_id: 'FREE',
                    onboarding_state: 'CREATED'
                }
            });

            // 2. Create Membership (OWNER)
            await tx.workspaceMembership.create({
                data: {
                    workspace_id: account.id,
                    user_id: userId,
                    role: 'OWNER',
                    status: 'ACTIVE'
                }
            });

            // 3. Initialize Owner Settings (Phase 20)
            // Hardcoded defaults here to avoid circular dependencies with OwnerSettingsService
            // or needing to pass 'tx' into the service.
            await tx.ownerSettings.create({
                data: {
                    workspace_id: account.id,
                    mode: 'OBSERVE_ONLY',
                    aggressiveness: 'CONSERVATIVE',
                    enable_intents: '{}',
                    platforms_enabled: '[]'
                }
            });

            return account;
        });
    }

    /**
     * List all active workspaces for a user.
     */
    static async listWorkspaces(userId: string) {
        return await prisma.workspaceMembership.findMany({
            where: {
                user_id: userId,
                status: 'ACTIVE',
                account: { status: 'ACTIVE' }
            },
            include: {
                account: {
                    select: { id: true, name: true, status: true, plan_id: true }
                }
            }
        });
    }

    /**
     * Verify if user is a member of the workspace.
     */
    static async verifyMembership(userId: string, workspaceId: string): Promise<boolean> {
        const count = await prisma.workspaceMembership.count({
            where: {
                user_id: userId,
                workspace_id: workspaceId,
                status: 'ACTIVE',
                account: { status: 'ACTIVE' }
            }
        });
        return count > 0;
    }
}
