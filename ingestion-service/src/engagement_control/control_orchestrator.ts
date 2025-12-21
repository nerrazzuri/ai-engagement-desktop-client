import { EngagementActionPlan } from '../engagement_action/types';
import { ControlledAction, ControlDecision } from './types';
import { ApprovalQueue } from './approval_queue';
import { DecisionHandler } from './decision_handler';
import { AuditLog } from './audit_log';

export class ControlOrchestrator {
    static submitPlan(plan: EngagementActionPlan): ControlledAction {
        const action = ApprovalQueue.enqueue(plan);
        AuditLog.log(action, 'QUEUED');
        return action;
    }

    static getPendingActions(): ControlledAction[] {
        return ApprovalQueue.listPending();
    }

    static submitDecision(actionId: string, decision: ControlDecision): ControlledAction {
        const action = ApprovalQueue.getById(actionId);
        if (!action) throw new Error(`Action ID ${actionId} not found`);

        return DecisionHandler.process(action, decision);
    }
}
