import { Request, Response, NextFunction } from 'express';

// In-memory store for rate limiting (would be Redis in prod)
const RATE_LIMITS = new Map<string, { count: number, resetAt: number }>();
const VALID_INSTALLS = new Map<string, string>(); // install_id -> token

// Mock valid install for verification
VALID_INSTALLS.set('test-install-id', 'test-token');

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Dev Admin Bypass (Testing)
    if (process.env.NODE_ENV === 'development' && req.headers['x-dev-admin'] === '1') {
        return next();
    }

    const installId = req.headers['x-install-id'] as string;
    const token = req.headers['authorization']?.replace('Bearer ', '');

    if (!installId || !token) {
        return res.status(401).json({ status: 'error', message: 'Missing credentials' });
    }

    // 1. Verify Token (Mock implementation: check if matches valid installs)
    // In real implementation, this would verify a JWT signed by our backend
    // For now, we simulate "per-install short-lived token" by just checking equality
    // or accepting any token if we want to be lax for testing, but plan says "strict"
    // So let's enforcing a specific format or mock value.

    if (token !== `token-for-${installId}` && token !== 'test-token') {
        // Allow 'token-for-{installId}' as a dynamic valid token for testing any ID
        return res.status(403).json({ status: 'error', message: 'Invalid token' });
    }

    // 2. Rate Limiting
    const now = Date.now();
    const limitWindow = 60 * 1000; // 1 minute
    const maxRequests = 60; // 60 requests per minute

    let usage = RATE_LIMITS.get(installId);
    if (!usage || now > usage.resetAt) {
        usage = { count: 0, resetAt: now + limitWindow };
    }

    if (usage.count >= maxRequests) {
        return res.status(429).json({ status: 'error', message: 'Rate limit exceeded' });
    }

    usage.count++;
    RATE_LIMITS.set(installId, usage);

    next();
};
