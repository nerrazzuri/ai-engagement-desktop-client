
import { Router, Request, Response } from 'express';
import { requireSession, requireWorkspace } from '../middleware/session_auth';
import { OwnerSettingsService } from '../services/owner/owner_settings_service';

const router = Router();

// Middleware: Session + Workspace Required
router.use(requireSession);
router.use(requireWorkspace);

// GET /owner/settings
router.get('/settings', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const settings = await OwnerSettingsService.getSettings(workspaceId);
        res.json(settings);
    } catch (err) {
        console.error('[Owner] Get Settings Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /owner/settings
router.put('/settings', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const updates = req.body;

        // Prevent updating ID fields
        delete updates.workspace_id;
        delete updates.user_id;

        const updated = await OwnerSettingsService.updateSettings(workspaceId, updates);
        res.json(updated);
    } catch (err: any) {
        console.warn('[Owner] Update Settings Validation Error:', err.message);
        res.status(400).json({ error: err.message });
    }
});

// POST /owner/settings/reset
router.post('/settings/reset', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const reset = await OwnerSettingsService.resetSettings(workspaceId);
        res.json(reset);
    } catch (err) {
        console.error('[Owner] Reset Settings Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /owner/installs (For verification/setup)
router.post('/installs', async (req: Request, res: Response) => {
    try {
        const workspaceId = req.activeWorkspaceId!;
        const { install_id } = req.body;
        if (!install_id) {
            res.status(400).json({ error: 'install_id required' });
            return;
        }

        const install = await OwnerSettingsService.createInstall(workspaceId, install_id);
        res.json({ install });
    } catch (err) {
        console.error('[Owner] Create Install Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
