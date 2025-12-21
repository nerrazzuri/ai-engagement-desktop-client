
import { prisma } from '../../db';
import { OwnerSettings } from '@prisma/client';

export enum EngagementMode {
    OBSERVE_ONLY = 'OBSERVE_ONLY',
    SUGGEST = 'SUGGEST',
    ASSIST = 'ASSIST'
}

export enum Aggressiveness {
    CONSERVATIVE = 'CONSERVATIVE',
    BALANCED = 'BALANCED',
    ASSERTIVE = 'ASSERTIVE'
}

// Default Settings
const DEFAULT_SETTINGS = {
    mode: EngagementMode.OBSERVE_ONLY,
    aggressiveness: Aggressiveness.CONSERVATIVE,
    enable_intents: JSON.stringify({}), // All disabled by default implies conservative
    min_intent_confidence: 0.7,
    platforms_enabled: JSON.stringify([]),
    max_suggestions_per_day: 20,
    max_suggestions_per_video: 2,
    cooldown_hours: 24,
    preferred_language: null,
    tone: null
};

export class OwnerSettingsService {

    /**
     * Get settings for a workspace. 
     * Creates defaults if they stick don't exist (Lazy Init).
     */
    static async getSettings(workspaceId: string): Promise<OwnerSettings> {
        let settings = await prisma.ownerSettings.findUnique({
            where: { workspace_id: workspaceId }
        });

        if (!settings) {
            settings = await this.ensureSettings(workspaceId);
        }

        return settings;
    }

    /**
     * Ensure settings exist for a workspace. used during creation or lazy-load.
     */
    static async ensureSettings(workspaceId: string): Promise<OwnerSettings> {
        return await prisma.ownerSettings.upsert({
            where: { workspace_id: workspaceId },
            update: {},
            create: {
                workspace_id: workspaceId,
                ...DEFAULT_SETTINGS
            }
        });
    }

    /**
     * Update settings. 
     * Validates enums and ranges.
     */
    static async updateSettings(workspaceId: string, updates: Partial<OwnerSettings>): Promise<OwnerSettings> {
        // Validation
        if (updates.mode && !Object.values(EngagementMode).includes(updates.mode as EngagementMode)) {
            throw new Error(`Invalid Mode: ${updates.mode}`);
        }
        if (updates.aggressiveness && !Object.values(Aggressiveness).includes(updates.aggressiveness as Aggressiveness)) {
            throw new Error(`Invalid Aggressiveness: ${updates.aggressiveness}`);
        }
        if (updates.max_suggestions_per_day !== undefined && updates.max_suggestions_per_day < 0) {
            throw new Error('max_suggestions_per_day must be >= 0');
        }
        if (updates.max_suggestions_per_video !== undefined && updates.max_suggestions_per_video < 0) {
            throw new Error('max_suggestions_per_video must be >= 0');
        }
        // Minimal cooldown check (though Phase 19 safety is hard floor, we enforce schema validity)
        if (updates.cooldown_hours !== undefined && updates.cooldown_hours < 0) {
            throw new Error('cooldown_hours must be >= 0');
        }

        // Apply
        return await prisma.ownerSettings.upsert({
            where: { workspace_id: workspaceId },
            update: {
                ...updates,
                updated_at: new Date()
            },
            create: {
                workspace_id: workspaceId,
                ...DEFAULT_SETTINGS,
                ...updates as any // validation done above
            }
        });
    }

    /**
     * Reset to defaults.
     */
    static async resetSettings(workspaceId: string): Promise<OwnerSettings> {
        return await prisma.ownerSettings.update({
            where: { workspace_id: workspaceId },
            data: {
                ...DEFAULT_SETTINGS,
                updated_at: new Date()
            }
        });
    }

    /**
     * Create a new authorized install for the workspace.
     * Useful for verification and actual onboarding.
     */
    static async createInstall(workspaceId: string, installId: string): Promise<any> {
        // Simple creation. In real app, might verify uniqueness or quota.
        return await prisma.installRegistry.create({
            data: {
                install_id: installId,
                account_id: workspaceId,
                install_secret: 'secret', // Simplified for Polish/Verification
                is_active: true
            }
        });
    }
}
