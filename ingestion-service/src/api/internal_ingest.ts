import { Router, Request, Response } from 'express';
import { config } from '../config';
import { prisma } from '../db';
import { IngestionService, IngestStatus } from '../services/ingestion/ingestion_service';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Middleware: Internal Secret & Headers
const requireInternalAuth = async (req: Request, res: Response, next: Function) => {
    const secret = req.headers['x-internal-secret'];
    const tenantId = req.headers['x-tenant-id'] as string; // Account ID? Or Tenant Context? 
    // Plan said "X-Tenant-Id" and "X-Install-Id".
    // Usually Tenant = Account. Install = Device.
    const installId = req.headers['x-install-id'] as string;

    if (secret !== config.internalSecret) {
        res.status(401).json({ error: 'Unauthorized: Invalid Secret' });
        return;
    }

    if (!tenantId || !installId) {
        res.status(400).json({ error: 'Missing Identity Headers (x-tenant-id, x-install-id)' });
        return;
    }

    // Verify Install/Account relationship strictly
    const install = await prisma.installRegistry.findUnique({
        where: { install_id: installId },
        include: { account: true }
    });

    if (!install || !install.account) {
        res.status(403).json({ error: 'Install not found or orphaned' });
        return;
    }

    if (install.account_id !== tenantId) {
        res.status(403).json({ error: 'Tenant Mismatch: Install does not belong to this Tenant' });
        return;
    }

    if (install.account.status !== 'ACTIVE') {
        res.status(403).json({ error: 'Account Suspended' });
        return;
    }

    // Attach checked IDs for controller
    (req as any).checkedInstallId = installId;
    (req as any).checkedAccountId = tenantId;

    next();
};

router.post('/ingest/event', requireInternalAuth, async (req: Request, res: Response) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
    const installId = (req as any).checkedInstallId;
    const accountId = (req as any).checkedAccountId;

    try {
        const result = await IngestionService.processEvent(
            req.body,
            installId,
            accountId,
            correlationId
        );

        // Always 200 OK for Success/Dedup/Blocked
        // Only 4xx/5xx for System Errors or Auth/Schema
        // Schema error throws in service, caught below.

        res.json({
            status: 'ok',
            ingest_status: result.status,
            id: result.id,
            correlation_id: correlationId
        });

    } catch (e: any) {
        if (e.message === 'Invalid Schema') {
            res.status(400).json({ error: 'Invalid Schema', details: e.issues || e.message });
            return;
        }
        console.error(`[IngestAPI][${correlationId}] Error:`, e);
        res.status(500).json({ error: 'Internal Ingestion Error', correlation_id: correlationId });
    }
});

export const internalIngestRouter = router;
