import { Request, Response, NextFunction } from 'express';
import { SessionStore } from '../services/auth/session_store';

/**
 * Validates Bearer token.
 * Populates req.user, req.session.
 * Returns 401 if invalid.
 */
export const requireSession = async (req: Request, res: Response, next: NextFunction) => {
    // Safety Valve: Explicitly allow public routes if they accidentally hit this middleware
    if (req.originalUrl.startsWith('/auth/login')) {
        return next();
    }

    // Dev Admin Bypass (Testing)
    if (process.env.NODE_ENV === 'development' && req.headers['x-dev-admin'] === '1') {
        console.warn(`[Auth] Bypass Activated for ${req.path}`);
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
            error: 'Unauthorized: No Token',
        });
        return;
    }

    const token = authHeader.split(' ')[1];
    const session = await SessionStore.getSession(token);

    if (!session) {
        res.status(401).json({ error: 'Unauthorized: Invalid or Expired Session' });
        return;
    }

    // Attach to Request
    req.session = session;
    req.user = session.user;

    // Propagate active workspace if set AND ACTIVE
    if (session.active_workspace_id && session.active_workspace) {
        if (session.active_workspace.status === 'ACTIVE') {
            req.activeWorkspaceId = session.active_workspace_id;
        } else {
            console.warn(`[Auth] Blocked access to suspended workspace ${session.active_workspace_id}`);
        }
    }

    next();
};

/**
 * Ensures req.activeWorkspaceId is present.
 * MUST be used AFTER requireSession.
 * Returns 409 if no workspace selected.
 */
export const requireWorkspace = (req: Request, res: Response, next: NextFunction) => {
    if (!req.activeWorkspaceId) {
        res.status(409).json({
            error: 'WORKSPACE_NOT_SELECTED',
            message: 'Please switch to a workspace first.'
        });
        return;
    }
    next();
};
