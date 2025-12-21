import { SafetyConfigService } from './config_service';
import { EngagementTarget, SafetyCheckResult, DOWNGRADE_MAP } from './types';
import { RateLimiter } from './rate_limiter';
import { CooldownEnforcer } from './cooldown_enforcer';
import { StrategyType } from '../brain/types';

export class SafetyService {

    // Check 1: Must we stop BEFORE using Intelligence?
    public static async preCheck(target: EngagementTarget): Promise<SafetyCheckResult> {
        const config = SafetyConfigService.getInstance();
        const mode = config.getMode();

        // 1. Kill Switch (Absolute)
        if (config.isKillSwitchActive(target.platform)) {
            return this.enforceOrShadow(mode, {
                allowed: false,
                reason: 'kill_switch_active',
                rule_id: 'kill_switch',
                override_strategy: 'IGNORE'
            });
        }

        // 2. Cooldown
        const cooldown = await CooldownEnforcer.checkCooldown(target);
        if (!cooldown.allowed) {
            return this.enforceOrShadow(mode, {
                allowed: false,
                reason: cooldown.reason!,
                rule_id: 'cooldown_violation',
                override_strategy: 'IGNORE' // Hard ignore on cooldown
            });
        }

        // 3. Pre-Rate Limit (Daily User/Global)
        const rate = await RateLimiter.checkPreLimits(target);
        if (!rate.allowed) {
            return this.enforceOrShadow(mode, {
                allowed: false,
                reason: rate.reason!,
                rule_id: 'pre_rate_limit',
                override_strategy: 'IGNORE'
            });
        }

        return { allowed: true, reason: 'pass', rule_id: 'pass' };
    }

    // Check 2: Must we downgrade existing strategy?
    // Only runs if Brain returned a reply intent.
    public static async postCheck(
        target: EngagementTarget,
        videoId: string,
        currentStrategy: StrategyType
    ): Promise<SafetyCheckResult> {
        const config = SafetyConfigService.getInstance();
        const mode = config.getMode();

        // If we already plan to ignore, safety check is moot
        if (currentStrategy === 'IGNORE') {
            return { allowed: true, reason: 'ignore_strategy', rule_id: 'pass' };
        }

        // Check Video Limits (e.g. max 2 replies per video)
        // Check Video Limits (e.g. max 2 replies per video)
        // Gap C Fix: Pass Account ID
        const videoLimit = await RateLimiter.checkPostLimits(videoId, target.accountId);
        if (!videoLimit.allowed) {
            const downgraded = DOWNGRADE_MAP[currentStrategy] || 'IGNORE';
            return this.enforceOrShadow(mode, {
                allowed: false,
                reason: videoLimit.reason!,
                rule_id: 'video_rate_limit',
                override_strategy: downgraded
            });
        }

        return { allowed: true, reason: 'pass', rule_id: 'pass' };
    }

    private static enforceOrShadow(mode: string, violation: SafetyCheckResult): SafetyCheckResult {
        if (mode === 'SHADOW') {
            console.warn(`[Safety:SHADOW] Would have blocked: ${violation.reason} (${violation.rule_id})`);
            return {
                allowed: true, // Allow it
                reason: 'shadow_mode_pass',
                rule_id: 'shadow_override',
                is_shadow_violation: true
            };
        }
        return violation;
    }
}
