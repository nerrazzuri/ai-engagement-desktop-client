import { StrategyType } from '../brain/types';

export type SafetyMode = 'ENFORCE' | 'SHADOW';

export interface EngagementTarget {
    platform: string;
    target_id: string; // "platform:author_name" OR "platform:thread_id" if unavailable
    accountId: string;
}

export interface LimitConfig {
    max_replies_per_day: number;
    max_replies_per_video: number;
    max_replies_per_target_daily: number;
    cooldown_hours: number;
}

export interface KillSwitchState {
    global_enabled: boolean;
    platform_disabled: Record<string, boolean>; // e.g. { tiktok: true }
}

export interface SafetyCheckResult {
    allowed: boolean;
    reason: string;
    rule_id: string; // e.g., 'kill_switch', 'rate_limit_daily'
    override_strategy?: StrategyType; // Downgrade suggestions
    is_shadow_violation?: boolean; // True if would have blocked in ENFORCE mode
}

export const DEFAULT_SAFETY_CONFIG: LimitConfig = {
    max_replies_per_day: 50,
    max_replies_per_video: 2,
    max_replies_per_target_daily: 100,
    cooldown_hours: 24
};

export const DOWNGRADE_MAP: Record<string, StrategyType> = {
    'ANSWER': 'SILENT_CAPTURE',
    'ACKNOWLEDGE': 'SILENT_CAPTURE',
    'DE_ESCALATE': 'SILENT_CAPTURE',
    'ASK_FOLLOWUP': 'SILENT_CAPTURE',
    'SILENT_CAPTURE': 'OBSERVE_ONLY',
    'OBSERVE_ONLY': 'IGNORE',
    'IGNORE': 'IGNORE'
};
