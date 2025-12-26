import { Router, Request, Response } from 'express';
import { requireSession, requireWorkspace } from '../middleware/session_auth';
import { SuggestionService } from '../services/suggestions/suggestion_service';

const router = Router();

router.use(requireSession);
router.use(requireWorkspace);

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

// POST /suggestions/:id/decision
router.post('/:id/decision', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const userId = req.user!.id;
        const { decision, reason } = req.body; // decision: 'POST' | 'REJECT'

        if (decision === 'POST') {
            const result = await SuggestionService.markAsPosted(workspaceId, userId, req.params.id, reason);
            res.json(result);
        } else if (decision === 'REJECT') {
            const result = await SuggestionService.rejectSuggestion(workspaceId, userId, req.params.id, reason);
            res.json(result);
        } else {
            res.status(400).json({ error: 'Invalid decision. Use POST or REJECT.' });
        }
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

export const suggestionsRouter = router;
