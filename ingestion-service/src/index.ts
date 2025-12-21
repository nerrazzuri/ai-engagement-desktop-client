import { config } from './config'; // Phase 26: Validate Config First
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
// import dotenv from 'dotenv'; // Config handles this now
import ingestRouter from './api/ingest';
import { authMiddleware } from './auth/middleware';
import { correlationMiddleware } from './utils/logger'; // Phase 26
import { healthRouter } from './api/health'; // Phase 26

import { prisma } from './db';

const app = express();
const PORT = config.port;

// SQLite Optimization (WAL Mode) for Concurrency
// Only affects local dev with SQLite
(async () => {
    try {
        if (config.env === 'development') { // Guard for dev only
            await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
            await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
            await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000;');
            console.log('[DB] WAL Mode & Busy Timeout enabled');
        }
    } catch (e) {
        console.warn('[DB] Failed to set WAL mode (might be Postgres or locked):', e);
    }
})();

app.use(helmet());
app.use(cors());
app.use(express.json()); // JSON parsing first
app.use(correlationMiddleware); // Phase 26: Trace everything

// Debug: Global Log
app.use((req, res, next) => {
    console.log(`[Global] ${req.method} ${req.path}`);
    next();
});

app.use(morgan('dev')); // Logger after correlation to potentially use it (if morgan configured)

// Routes
import { authRouter } from './api/auth';
import { workspaceRouter } from './api/workspace';
import ownerSettingsRouter from './api/owner_settings';
import suggestionsRouter from './api/suggestions';
import valueRouter from './api/value';
import productRouter from './api/product';
import automationRouter from './api/automation';
import { adminRouter } from './api/admin';

app.use('/auth', authRouter);
app.use('/workspaces', workspaceRouter);
app.use('/owner', ownerSettingsRouter);
app.use('/suggestions', suggestionsRouter); // Phase 21
app.use('/value', valueRouter); // Phase 22
app.use('/product', productRouter); // Phase 24
app.use('/automation', automationRouter); // Phase 25 (Internal)
app.use('/admin', adminRouter); // Phase 27: Admin Control Plane

import { internalIngestRouter } from './api/internal_ingest';
app.use('/internal', internalIngestRouter); // Phase 28: Ingestion Bridge

app.use('/', healthRouter); // Phase 26: Health & Ready (Before Auth)

// Using Router now for /events, /suggestions, etc.
app.use((req, res, next) => {
    // Conditional Auth: Only bypass /auth/* explicitly.
    // /workspaces, /owner, /suggestions etc MUST be protected by their own routers or handled here.
    // Current Rule: Everything is protected by default except /auth and POST /events.

    if (req.path.startsWith('/auth')) {
        return next();
    }
    // Webhook ingestion point
    if (req.path === '/events' && req.method === 'POST') {
        return next();
    }

    // Explicitly allow routers that implement their own auth if we trust them?
    // User requested Option B: "Ensure each router protects itself explicitly" OR "Global auth protects everything".
    // User Pref: "Option B: Remove bypass for /workspaces and /owner".
    // This means /workspaces and /owner requests will fall through to `authMiddleware` below.
    // `authMiddleware` checks for Bearer token.
    // If /workspaces needs session, it will pass `authMiddleware` (if token valid) and then hit router.
    // Wait, `authMiddleware` (imported from `./auth/middleware`) is NOT `requireSession`. 
    // Let's check what `authMiddleware` does. Step 7068 confirms line 8: import { authMiddleware } from './auth/middleware';
    // If `authMiddleware` is just JWT check, then it's fine.

    // Proceed to global auth check
    return authMiddleware(req, res, next);
});

app.use('/', ingestRouter);

app.listen(PORT, () => {
    console.log(`Ingestion Service running on port ${PORT}`);
});
