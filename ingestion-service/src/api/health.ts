
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient(); // Use separate client or global? Global usually better but this is fine for check.

// Liveness Probe (Is process running?)
router.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Readiness Probe (Can we serve traffic?)
router.get('/ready', async (req: Request, res: Response) => {
    const checks: Record<string, string> = {
        database: 'pending',
        ai_core: 'pending',
        config: 'ok' // validated at startup
    };

    let isReady = true;

    // 1. Database Check
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'ok';
    } catch (e) {
        checks.database = 'failed';
        isReady = false;
        logger.error('Readiness: Database check failed', { error: e, correlationId: req.correlationId });
    }

    // 2. AI Core Check (Ping)
    try {
        // Assuming AI Core has a root or health endpoint. Using root for now.
        // Timeout 2s
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const coreRes = await fetch(`${config.aiCoreUrl}/health`, {
            method: 'GET',
            headers: { 'X-Internal-Secret': config.aiCoreSecret },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (coreRes.ok) {
            checks.ai_core = 'ok';
        } else {
            checks.ai_core = `failed_status_${coreRes.status}`;
            isReady = false;
        }
    } catch (e) {
        checks.ai_core = 'unreachable';
        // Don't strict fail readiness on AI Core? 
        // User Requirement: "ai-engagement should not be ready if inference is unreachable" -> YES, strict fail.
        isReady = false;
        logger.error('Readiness: AI Core check failed', { error: String(e), correlationId: req.correlationId });
    }

    if (isReady) {
        res.status(200).json({ status: 'ready', checks });
    } else {
        res.status(503).json({ status: 'not_ready', checks });
    }
});

export const healthRouter = router;
