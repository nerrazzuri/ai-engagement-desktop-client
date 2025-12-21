
// import { PlanId } from '@prisma/client';

export enum PlanId {
    FREE = 'FREE',
    PRO = 'PRO',
    BUSINESS = 'BUSINESS'
}

export interface SystemCapabilities {
    will_do: string[];
    will_not_do: string[];
}

export interface PlanLimits {
    max_events_per_day: number;
    max_suggestions_per_day: number;
    max_platforms: number;
    max_team_members: number;
    automation_eligible: boolean;
}

export interface PlanDefinition {
    id: PlanId;
    name: string;
    limits: PlanLimits;
    notes: string;
}

/**
 * Canoncial Product Definition (Locked per Phase 24)
 */
export const ProductDef = {
    // 1. Narrative
    narrative: {
        version: "1.0.0",
        text: "The system observes public conversations, flags meaningful engagement opportunities, and lets you decide what to respond to."
    },

    // 2. Boundaries
    boundaries: {
        will_do: [
            "Observe public comments",
            "Detect buying signals",
            "Suggest replies",
            "Explain why something was suggested",
            "Wait for human approval"
        ],
        will_not_do: [
            "Auto-post replies",
            "Impersonate content owners",
            "Attack competitors",
            "Guarantee sales",
            "Act without consent"
        ]
    } as SystemCapabilities,

    // 3. Plans
    plans: {
        [PlanId.FREE]: {
            id: PlanId.FREE,
            name: "Free Tier",
            limits: {
                max_events_per_day: 50,
                max_suggestions_per_day: 5,
                max_platforms: 1,
                max_team_members: 1,
                automation_eligible: false
            },
            notes: "Safe starter plan for individual exploration."
        },
        [PlanId.PRO]: {
            id: PlanId.PRO,
            name: "Pro Tier",
            limits: {
                max_events_per_day: 500,
                max_suggestions_per_day: 50,
                max_platforms: 3,
                max_team_members: 3,
                automation_eligible: false
            },
            notes: "For growing brands with moderate volume."
        },
        [PlanId.BUSINESS]: {
            id: PlanId.BUSINESS,
            name: "Business Tier",
            limits: {
                max_events_per_day: 2000,
                max_suggestions_per_day: 200,
                max_platforms: 5,
                max_team_members: 10,
                automation_eligible: true // Phase 25 unlock
            },
            notes: "Full power for teams."
        }
    } as Record<PlanId, PlanDefinition>,

    // Helper
    getPlan(id: PlanId | string): PlanDefinition {
        // Default to FREE if unknown/invalid
        const plan = this.plans[id as PlanId];
        return plan || this.plans[PlanId.FREE];
    }
};
