import { Router, Request, Response } from 'express';
import { requireSession, requireWorkspace } from '../middleware/session_auth';
import { ValueService } from '../services/value/value_service';

const router = Router();

router.use(requireSession);
router.use(requireWorkspace);

// GET /value/analytics
router.get('/analytics', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const analytics = await ValueService.getAnalytics(workspaceId);
        res.json(analytics);
    } catch (err: any) {
        console.error('[API] Value Analytics Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export const valueRouter = router;
