import { LimitConfig, KillSwitchState, SafetyMode, DEFAULT_SAFETY_CONFIG } from './types';

export class SafetyConfigService {
    private static instance: SafetyConfigService;

    private mode: SafetyMode = 'ENFORCE';

    private killSwitch: KillSwitchState = {
        global_enabled: false, // False means allow (safety OFF)
        platform_disabled: {}
    };

    private limits: LimitConfig = { ...DEFAULT_SAFETY_CONFIG };

    private constructor() {
        // Load from ENV if available (Phase 19.5 future-proof)
        if (process.env.SAFETY_MODE === 'SHADOW') {
            this.mode = 'SHADOW';
        }
    }

    public static getInstance(): SafetyConfigService {
        if (!this.instance) {
            this.instance = new SafetyConfigService();
        }
        return this.instance;
    }

    // --- Mode ---
    public getMode(): SafetyMode {
        return this.mode;
    }

    public setMode(mode: SafetyMode) {
        this.mode = mode;
    }

    // --- Kill Switch ---
    public isKillSwitchActive(platform?: string): boolean {
        if (this.killSwitch.global_enabled) return true;
        if (platform && this.killSwitch.platform_disabled[platform.toLowerCase()]) return true;
        return false;
    }

    public setGlobalKillSwitch(active: boolean) {
        this.killSwitch.global_enabled = active;
    }

    public setPlatformKillSwitch(platform: string, active: boolean) {
        this.killSwitch.platform_disabled[platform.toLowerCase()] = active;
    }

    // --- Limits ---
    public getLimits(): LimitConfig {
        return this.limits;
    }

    public updateLimits(newLimits: Partial<LimitConfig>) {
        this.limits = { ...this.limits, ...newLimits };
    }
}
