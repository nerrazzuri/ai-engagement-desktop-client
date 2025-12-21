
import { Router, Request, Response } from 'express';
import { requireSession, requireWorkspace } from '../middleware/session_auth';
import { ValueService } from '../services/value/value_service';

const router = Router();

// All routes require Auth + Workspace
router.use(requireSession);
router.use(requireWorkspace);

// GET /value/summary
// High-level dashboard metrics
router.get('/summary', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const summary = await ValueService.getSummary(workspaceId);
        res.json(summary);
    } catch (err: any) {
        console.error('[ValueAPI] Summary Error:', err);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

// GET /value/breakdown
// Detailed analysis
router.get('/breakdown', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const breakdown = await ValueService.getBreakdown(workspaceId);
        res.json(breakdown);
    } catch (err: any) {
        console.error('[ValueAPI] Breakdown Error:', err);
        res.status(500).json({ error: 'Failed to fetch breakdown' });
    }
});

// GET /value/decisions
// Timeline of human actions
router.get('/decisions', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const decisions = await ValueService.getDecisions(workspaceId);
        res.json(decisions);
    } catch (err: any) {
        console.error('[ValueAPI] Decisions Error:', err);
        res.status(500).json({ error: 'Failed to fetch decisions' });
    }
});

export default router;
