
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';

export const requireRole = (allowedRoles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Enforce Phase 27 Refinement: Session-based Active Workspace
        // req.session.active_workspace_id must be set.

        if (!req.session || !req.session.active_workspace_id) {
            res.status(403).json({ error: 'No active workspace selected' });
            return;
        }

        const workspaceId = req.session.active_workspace_id;
        const userId = req.user!.id;

        // Check Membership
        const membership = await prisma.workspaceMembership.findUnique({
            where: {
                workspace_id_user_id: {
                    workspace_id: workspaceId,
                    user_id: userId
                }
            }
        });

        if (!membership || membership.status !== 'ACTIVE') {
            res.status(403).json({ error: 'Access denied to this workspace' });
            return;
        }

        // Check Role
        if (!allowedRoles.includes(membership.role)) {
            res.status(403).json({ error: `Insufficient permissions. Required: ${allowedRoles.join(', ')}` });
            return;
        }

        // Check Suspension (Refinement: Centralized Check)
        // Ideally this should be cached or on the session, but DB check for strictness.
        // NOTE: Currently, Workspace IS Account (canonical row). 
        // If we split into UserWorkspace vs Account (Billing), this query must target the Billing entity.
        const account = await prisma.account.findUnique({ where: { id: workspaceId }, select: { status: true } });
        if (account?.status === 'SUSPENDED') {
            res.status(403).json({ error: 'Workspace is suspended' });
            return;
        }

        next();
    };
};
