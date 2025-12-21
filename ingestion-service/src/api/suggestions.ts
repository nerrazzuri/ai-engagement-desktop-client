
import { Router, Request, Response } from 'express';
import { requireSession } from '../middleware/session_auth';
import { requireRole } from '../auth/role_middleware';
import { SuggestionService } from '../services/hitl/suggestion_service';

const router = Router();

router.use(requireSession);
// Phase 27: RBAC & Suspension Check (Replaces simple requireWorkspace)
router.use(requireRole(['OWNER', 'ADMIN', 'MEMBER']));

// GET /suggestions
router.get('/', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const status = req.query.status as string | undefined;
        const suggestions = await SuggestionService.listSuggestions(workspaceId, status);
        res.json(suggestions);
    } catch (err) {
        console.error('[API] List Suggestions Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /suggestions/:id
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const detail = await SuggestionService.getSuggestionDetail(workspaceId, req.params.id);
        res.json(detail);
    } catch (err: any) {
        res.status(404).json({ error: err.message });
    }
});

// POST /suggestions/:id/approve
router.post('/:id/approve', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const userId = req.session!.user_id;
        const { note } = req.body;
        const result = await SuggestionService.approveSuggestion(workspaceId, userId, req.params.id, note);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// POST /suggestions/:id/reject
router.post('/:id/reject', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const userId = req.session!.user_id;
        const { reason } = req.body;
        const result = await SuggestionService.rejectSuggestion(workspaceId, userId, req.params.id, reason);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// POST /suggestions/:id/edit
router.post('/:id/edit', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const userId = req.session!.user_id;
        const { final_text, note } = req.body;
        if (!final_text) {
            res.status(400).json({ error: 'final_text required' });
            return;
        }
        const result = await SuggestionService.editSuggestion(workspaceId, userId, req.params.id, final_text, note);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

export default router;
