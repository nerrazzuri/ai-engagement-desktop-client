
import { prisma } from '../../db';
// import { OnboardingState } from '@prisma/client'; 

export enum OnboardingState {
    CREATED = 'CREATED',
    FIRST_EVENT_INGESTED = 'FIRST_EVENT_INGESTED',
    FIRST_SUGGESTION_CREATED = 'FIRST_SUGGESTION_CREATED',
    FIRST_DECISION_MADE = 'FIRST_DECISION_MADE',
    ONBOARDED = 'ONBOARDED'
}

const StateOrder: Record<OnboardingState, number> = {
    [OnboardingState.CREATED]: 0,
    [OnboardingState.FIRST_EVENT_INGESTED]: 1,
    [OnboardingState.FIRST_SUGGESTION_CREATED]: 2,
    [OnboardingState.FIRST_DECISION_MADE]: 3,
    [OnboardingState.ONBOARDED]: 4
};

const NextSteps: Record<OnboardingState, string> = {
    [OnboardingState.CREATED]: "Ingest your first event (use Chrome Extension).",
    [OnboardingState.FIRST_EVENT_INGESTED]: "Wait for the Brain to generate a suggestion.",
    [OnboardingState.FIRST_SUGGESTION_CREATED]: "Review and Approve/Reject the suggestion.",
    [OnboardingState.FIRST_DECISION_MADE]: "You are ready! Dashboard is fully unlocked.",
    [OnboardingState.ONBOARDED]: "Explore Pro features or automate workflows."
};

export class OnboardingService {

    /**
     * Advance onboarding state idempotently.
     * Only moves forward.
     */
    static async advance(workspaceId: string, targetState: OnboardingState): Promise<void> {
        const account = await prisma.account.findUnique({
            where: { id: workspaceId },
            select: { onboarding_state: true }
        });

        if (!account) return;

        const currentRank = StateOrder[account.onboarding_state as unknown as OnboardingState] || 0;
        const targetRank = StateOrder[targetState] || 0;

        if (targetRank > currentRank) {
            console.log(`[Onboarding] Advancing ${workspaceId} from ${account.onboarding_state} to ${targetState}`);
            await prisma.account.update({
                where: { id: workspaceId },
                data: { onboarding_state: targetState }
            });
        }
    }

    static getStatus(state: OnboardingState) {
        return {
            state: state,
            next_step: NextSteps[state] || "Unknown step"
        };
    }
}
