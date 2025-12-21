
import { Router } from 'express';
import { prisma } from '../db';
import { requireSession } from '../middleware/session_auth';
import { ProductDef, PlanId } from '../services/product/product_def';
import { OnboardingService, OnboardingState } from '../services/product/onboarding_service';
import { PlanEnforcer } from '../services/product/plan_enforcer';

const router = Router();

// 1. Get Product Info (Public-ish, but requires session for simplicity)
router.get('/info', requireSession, (req, res) => {
    res.json({
        narrative: ProductDef.narrative,
        boundaries: ProductDef.boundaries,
        version: "24.0" // MSP Lock Version
    });
});

// 2. Get Plan Info (Workspace Scoped)
router.get('/plan', requireSession, async (req, res) => {
    try {
        const workspaceId = req.session?.active_workspace_id;
        if (!workspaceId) return res.status(400).json({ error: 'No active workspace' });

        const account = await prisma.account.findUnique({
            where: { id: workspaceId }
        });

        if (!account) return res.status(404).json({ error: 'Workspace not found' });

        const planDef = ProductDef.getPlan(account.plan_id as PlanId);

        res.json({
            plan_id: planDef.id,
            name: planDef.name,
            limits: planDef.limits,
            automation_eligible: planDef.limits.automation_eligible,
            notes: planDef.notes
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Get Onboarding Status
router.get('/onboarding', requireSession, async (req, res) => {
    try {
        const workspaceId = req.session?.active_workspace_id;
        if (!workspaceId) return res.status(400).json({ error: 'No active workspace' });

        const account = await prisma.account.findUnique({
            where: { id: workspaceId }
        });

        if (!account) return res.status(404).json({ error: 'Workspace not found' });

        const status = OnboardingService.getStatus(account.onboarding_state as OnboardingState);

        res.json(status);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
