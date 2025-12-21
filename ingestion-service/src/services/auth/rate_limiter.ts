
interface RateLimitEntry {
    attempts: number;
    windowStart: number;
    blockedUntil?: number;
}

export class RateLimitService {
    private static store = new Map<string, RateLimitEntry>();

    // Config
    private static readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    private static readonly MAX_ATTEMPTS = 10; // 10 attempts per IP per window (strict for IP)
    private static readonly BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes

    // TODO: Replace with Redis-backed rate limiting when we run >1 replica.
    // Current in-memory map resets on restart and doesn't share state between instances.

    /**
     * Check if IP is allowed. Throws error if blocked.
     */
    static check(ip: string): void {
        const entry = this.store.get(ip);
        if (!entry) return;

        const now = Date.now();

        // Check Block
        if (entry.blockedUntil && now < entry.blockedUntil) {
            const waitMin = Math.ceil((entry.blockedUntil - now) / 60000);
            throw new Error(`Too many attempts. Please try again in ${waitMin} minutes.`);
        }

        // Cleanup expired window
        if (now - entry.windowStart > this.WINDOW_MS) {
            this.store.delete(ip);
        }
    }

    /**
     * Record a failed attempt
     */
    static recordFail(ip: string): void {
        const now = Date.now();
        let entry = this.store.get(ip);

        // Init if new or expired
        if (!entry || (now - entry.windowStart > this.WINDOW_MS)) {
            entry = { attempts: 0, windowStart: now };
        }

        entry.attempts++;

        if (entry.attempts >= this.MAX_ATTEMPTS) {
            entry.blockedUntil = now + this.BLOCK_DURATION;
            console.warn(`[RateLimit] Blocked IP ${ip} for ${this.BLOCK_DURATION}ms`);
        }

        this.store.set(ip, entry);
    }

    /**
     * Reset on success
     */
    static reset(ip: string): void {
        this.store.delete(ip);
    }

    // Optional: Periodic cleanup could be added here
}
