import { Router, Request, Response } from 'express';
import { requireSession } from '../middleware/session_auth';
import { WorkspaceService } from '../services/workspace/workspace_service';
import { SessionStore } from '../services/auth/session_store';

const router = Router();

router.use(requireSession);

// GET /workspaces
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

// POST /workspaces/switch
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

export const workspaceRouter = router;
