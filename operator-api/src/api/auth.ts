import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth/auth_service';
import { requireSession } from '../middleware/session_auth';

const router = Router();

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'Email and password required' });
            return;
        }

        const ip = req.ip || '127.0.0.1';
        const result = await AuthService.login(email, password, ip);

        if (!result) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        res.json({
            session_token: result.token,
            user: {
                id: result.user.id,
                email: result.user.email,
            },
            active_workspace_id: result.activeWorkspaceId
        });
    } catch (err: any) {
        console.error('[Auth] Login Error:', err);
        if (err.message && err.message.includes('Too many attempts')) {
            res.status(429).json({ error: err.message });
        } else if (err.message && err.message.includes('Account locked')) {
            res.status(403).json({ error: err.message });
        } else {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});

// GET /auth/me
router.get('/me', requireSession, (req: Request, res: Response) => {
    res.json({
        user: {
            id: req.user!.id,
            email: req.user!.email
        },
        session: {
            active_workspace_id: req.session!.active_workspace_id,
            expires_at: req.session!.expires_at
        }
    });
});

// POST /auth/logout
router.post('/logout', requireSession, async (req: Request, res: Response) => {
    try {
        if (req.session) {
            await AuthService.logout(req.session.id);
        }
        res.json({ status: 'ok' });
    } catch (err) {
        console.error('[Auth] Logout Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export const authRouter = router;
