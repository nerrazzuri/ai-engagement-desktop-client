
import { Router, Request, Response } from 'express';
import { AdminAuthService } from '../services/auth/admin_auth_service';
import { requireAdmin } from '../auth/admin_middleware';
import { prisma } from '../db';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// --- Auth ---

router.post('/auth/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password required' });
            return;
        }

        const ip = req.ip || '127.0.0.1';
        const result = await AdminAuthService.login(email, password, ip);

        if (!result) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        res.json({
            token: result.token,
            admin: {
                id: result.admin.id,
                email: result.admin.email,
                role: result.admin.role
            }
        });
    } catch (e: any) {
        if (e.message && e.message.includes('Too many')) {
            res.status(429).json({ error: e.message });
            return;
        }
        console.error('Admin Login Error:', e);
        res.status(500).json({ error: 'Internal Error' });
    }
});

// --- Control Plane (Protected) ---

router.get('/workspaces', requireAdmin, async (req: Request, res: Response) => {
    const workspaces = await prisma.account.findMany({
        take: 50,
        orderBy: { created_at: 'desc' },
        include: { _count: { select: { events: true, suggestions: true, installs: true } } }
    });
    res.json({ workspaces });
});

router.post('/workspaces/:id/suspend', requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    // Audit Log should happen here
    await prisma.auditLog.create({
        data: {
            actor_id: req.admin!.id,
            actor_type: 'ADMIN',
            action: 'SUSPEND_WORKSPACE',
            resource: 'Account',
            resource_id: id,
            workspace_id: id,
            meta: JSON.stringify({ reason }),
            ip: req.ip || 'unknown',
            correlation_id: req.headers['x-correlation-id'] as string || uuidv4()
        }
    });

    const account = await prisma.account.update({
        where: { id },
        data: { status: 'SUSPENDED' }
    });

    res.json({ status: 'ok', account_status: account.status });
});

router.post('/workspaces/:id/unsuspend', requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;

    await prisma.auditLog.create({
        data: {
            actor_id: req.admin!.id,
            actor_type: 'ADMIN',
            action: 'UNSUSPEND_WORKSPACE',
            resource: 'Account',
            resource_id: id,
            workspace_id: id,
            ip: req.ip || 'unknown',
            correlation_id: req.headers['x-correlation-id'] as string || uuidv4()
        }
    });

    const account = await prisma.account.update({
        where: { id },
        data: { status: 'ACTIVE' }
    });

    res.json({ status: 'ok', account_status: account.status });
});

export const adminRouter = router;
