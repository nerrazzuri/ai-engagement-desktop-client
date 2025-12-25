
import dotenv from 'dotenv';
import path from 'path';

// Load .env
// Try resolving from CWD (root of service)
// Try resolving from CWD (root of service)
const envPath = path.resolve(process.cwd(), '.env');
console.log('[Config] Loading .env from:', envPath);
dotenv.config({ path: envPath });

const REQUIRED_SECRETS = [
    'DATABASE_URL',
    'AI_CORE_INTERNAL_SECRET'
];

// Phase 26: Fail Fast Config
function validateConfig() {
    const missing = REQUIRED_SECRETS.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error(`[Fatal] Missing required secrets: ${missing.join(', ')}`);
        process.exit(1); // Hard Fail
    }
}

validateConfig();

export const config = {
    port: process.env.PORT || 3006,
    env: process.env.NODE_ENV || 'development',
    dbUrl: process.env.DATABASE_URL!,
    aiCoreSecret: process.env.AI_CORE_INTERNAL_SECRET!,
    aiCoreUrl: process.env.AI_CORE_URL || 'http://localhost:8000', // Default to internal/dev
    internalSecret: process.env.AI_ENGAGEMENT_INTERNAL_SECRET || 'dev_secret_engagement', // For own internal routes
    logLevel: process.env.LOG_LEVEL || 'info',
    // Phase 27: Security Config
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    openaiApiKey: process.env.OPENAI_API_KEY
};
