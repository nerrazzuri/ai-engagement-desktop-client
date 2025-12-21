
import { ContextType, SpeakerRole, TemplateCategory } from '../types';

export class SafetyGate {
    static evaluate(
        context: ContextType,
        role: SpeakerRole,
        template: TemplateCategory
    ): { allowed: boolean; violation?: string } {

        // 1. OWNER_PROMOTIONAL Constraint
        // ONLY allowed on OWNED_CONTENT.
        if (template === TemplateCategory.OWNER_PROMOTIONAL) {
            if (context !== ContextType.OWNED_CONTENT) {
                return {
                    allowed: false,
                    violation: `OWNER_PROMOTIONAL forbidden on ${context}`
                };
            }
        }

        // 2. ALTERNATIVE_MENTION Constraint
        // ONLY allowed if Role is ALTERNATIVE_PROVIDER.
        if (template === TemplateCategory.ALTERNATIVE_MENTION) {
            if (role !== SpeakerRole.ALTERNATIVE_PROVIDER) {
                return {
                    allowed: false,
                    violation: `ALTERNATIVE_MENTION forbidden for role ${role}`
                };
            }
        }

        // 3. Role/Context Consistency
        if (role === SpeakerRole.OWNER && context !== ContextType.OWNED_CONTENT) {
            return {
                allowed: false,
                violation: `Role OWNER forbidden on ${context}`
            };
        }

        return { allowed: true };
    }
}
