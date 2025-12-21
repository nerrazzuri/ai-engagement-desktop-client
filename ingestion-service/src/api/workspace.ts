
import { Router, Request, Response } from 'express';
import { requireSession, requireWorkspace } from '../middleware/session_auth';
import { WorkspaceService } from '../services/workspace/workspace_service';
import { SessionStore } from '../services/auth/session_store';
import { prisma } from '../db';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

const router = Router();

// Apply Session Auth to all routes
router.use(requireSession);

// GET /workspaces - List all memberships
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const memberships = await WorkspaceService.listWorkspaces(userId);
        res.json(memberships);
    } catch (err) {
        console.error('[Workspace] List Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /workspaces - Create new workspace
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Workspace name required' });
            return;
        }

        const userId = req.user!.id;
        const newAccount = await WorkspaceService.createWorkspace(userId, name);

        // Auto-switch session to new workspace
        await SessionStore.updateActiveWorkspace(req.session!.id, newAccount.id);

        res.status(201).json({
            account: newAccount,
            message: 'Workspace created and selected'
        });
    } catch (err) {
        console.error('[Workspace] Create Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /session/switch-workspace
router.post('/switch', async (req: Request, res: Response) => {
    try {
        const { workspace_id } = req.body;
        if (!workspace_id) {
            res.status(400).json({ error: 'workspace_id required' });
            return;
        }

        const userId = req.user!.id;

        // Check membership
        const isMember = await WorkspaceService.verifyMembership(userId, workspace_id);
        if (!isMember) {
            res.status(403).json({ error: 'Access Denied: Not a member of this workspace' });
            return;
        }

        // Update Session
        await SessionStore.updateActiveWorkspace(req.session!.id, workspace_id);

        res.json({
            status: 'ok',
            active_workspace_id: workspace_id
        });
    } catch (err) {
        console.error('[Workspace] Switch Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /install - Create new Install for active workspace
router.post('/install', async (req: Request, res: Response) => {
    try {
        const { name } = req.body;

        const workspaceId = req.headers['x-workspace-id'] as string;
        if (!workspaceId) {
            res.status(400).json({ error: 'x-workspace-id header required' });
            return;
        }

        const userId = req.user!.id;
        // Verify membership
        const isMember = await WorkspaceService.verifyMembership(userId, workspaceId);
        if (!isMember) {
            res.status(403).json({ error: 'Access Denied' });
            return;
        }

        // Generate ID and Secret
        const installId = uuidv4();
        const secret = crypto.randomBytes(16).toString('hex');

        const install = await prisma.installRegistry.create({
            data: {
                install_id: installId,
                account_id: workspaceId,
                is_active: true,
                install_secret: secret
            }
        });

        res.json(install);

    } catch (err) {
        console.error('[Workspace] Create Install Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// export default router;
export const workspaceRouter = router;
