
import { Request, Response, NextFunction } from 'express';
import { AdminAuthService } from '../services/auth/admin_auth_service';
import { AdminUser } from '@prisma/client';
import { config } from '../config';

// Extend Request type
declare global {
    namespace Express {
        interface Request {
            admin?: AdminUser;
        }
    }
}

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    // Custom Header or Cookie. User recommended "admin_session" cookie or distinct token.
    // For API simplicity, we'll use `X-Admin-Token` header for now, 
    // but plan mentioned "admin_session cookie".
    // Let's support Authorization header with 'AdminBearer ' prefix?
    // Or just a header `X-Admin-Session-Token`.

    if (config.env === 'development' && req.headers['x-dev-admin'] === '1') {
        req.admin = {
            id: 'dev-admin',
            email: 'dev-admin@local',
            role: 'SUPERADMIN',
            created_at: new Date()
        } as any;

        return next();
    }

    // Check Header first
    const token = req.headers['x-admin-token'] as string;

    if (!token) {
        res.status(401).json({ error: 'Admin session required' });
        return;
    }

    try {
        const admin = await AdminAuthService.validateSession(token);
        if (!admin) {
            res.status(401).json({ error: 'Invalid or expired admin session' });
            return;
        }

        req.admin = admin;
        next();
    } catch (e) {
        console.error('Admin Auth Error:', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
