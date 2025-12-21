
import { Router, Request, Response } from 'express';
import { AutomationEligibilityService } from '../services/automation/eligibility_service';

const router = Router();

// Internal Admin/Debug Endpoint
// POST /automation/eligibility
router.post('/eligibility', async (req: Request, res: Response) => {
    const { suggestion_id } = req.body;

    if (!suggestion_id) {
        res.status(400).json({ error: 'Missing suggestion_id' });
        return;
    }

    try {
        const decision = await AutomationEligibilityService.evaluate(suggestion_id);
        res.json(decision);
    } catch (err: any) {
        console.error('[Automation] Eligibility Check Failed:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
