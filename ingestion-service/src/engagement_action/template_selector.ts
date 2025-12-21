import { PromotedEngagement } from '../engagement_promotion/types';
import * as templates from './config/action_templates.json';

export class TemplateSelector {
    static select(engagement: PromotedEngagement): { id: string; text: string } {
        const intent = engagement.signal.opportunity.primary_intent;
        const stage = engagement.signal.opportunity.buying_stage;

        const familyTemplates = (templates as any)[intent];
        if (familyTemplates) {
            const stageTemplate = familyTemplates[stage];
            if (stageTemplate) {
                return stageTemplate;
            }
        }

        // Default
        return (templates as any)['DEFAULT'];
    }
}
