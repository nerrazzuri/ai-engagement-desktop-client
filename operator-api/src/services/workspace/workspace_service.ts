
import { prisma } from '../../db';

export class WorkspaceService {

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
