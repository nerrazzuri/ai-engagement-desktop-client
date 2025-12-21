import { BaseAction, EngagementChannel } from './types';
import * as channelRules from './config/channel_rules.json';

export class ChannelConstraints {
    static apply(action: BaseAction, platform: string): { action: BaseAction; channel: EngagementChannel; modified: boolean } {
        const rules = (channelRules as any)[platform]; // "youtube", "instagram", etc.

        // If unknown platform, default to safe PUBLIC_REPLY / COMMENT
        if (!rules) {
            if (action === 'DM') return { action: 'PUBLIC_REPLY', channel: 'COMMENT', modified: true };
            if (action === 'ESCALATE') return { action: 'ESCALATE', channel: 'INTERNAL', modified: false }; // Escalation is internal
            if (action === 'NO_ACTION') return { action: 'NO_ACTION', channel: 'INTERNAL', modified: false };
            return { action: 'PUBLIC_REPLY', channel: 'COMMENT', modified: false };
        }

        let finalAction = action;
        let finalChannel: EngagementChannel = 'COMMENT';

        // Map Action to Channel
        if (action === 'DM') finalChannel = 'DM';
        else if (action === 'ESCALATE') finalChannel = 'INTERNAL';
        else if (action === 'PUBLIC_REPLY') finalChannel = 'COMMENT';
        else if (action === 'NO_ACTION') finalChannel = 'INTERNAL';

        // Check Restrictions
        if (action === 'DM' && rules.block_dm) {
            // Downgrade DM -> Public Reply
            finalAction = 'PUBLIC_REPLY';
            finalChannel = 'COMMENT';
            return { action: finalAction, channel: finalChannel, modified: true };
        }

        // Verify action is in allowed list
        /* 
        // Logic simplified: just check DM block for now as allowed_actions list implies capability.
        if (!rules.allowed_actions.includes(action)) {
             // If not allowed, fallback?
             // Not implementing complex fallback map yet.
             // Assume Public Reply is always allowed if not 'NO_ACTION'.
        }
        */

        return { action: finalAction, channel: finalChannel, modified: false };
    }
}
