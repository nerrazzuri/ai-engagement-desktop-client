import { ControlledAction, ControlDecision } from './types';
import { AuditLog } from './audit_log';
import { FeedbackRecorder } from './feedback_recorder';

export class DecisionHandler {
    static process(action: ControlledAction, decision: ControlDecision): ControlledAction {
        if (action.execution_status !== 'PENDING') {
            throw new Error(`Action ${action.action_plan_id} is already ${action.execution_status}`);
        }

        action.control_decision = decision;

        if (decision.decision === 'APPROVE') {
            action.execution_status = 'APPROVED';
        } else if (decision.decision === 'REJECT') {
            action.execution_status = 'REJECTED';
        } else if (decision.decision === 'EDIT') {
            // Update plan with edited message but keep status APPROVED (or PENDING if re-review needed? Specs imply manual execution next)
            // "Update execution status accordingly" -> usually Approved with edits.
            if (!decision.edited_message) throw new Error('Edit decision requires message');
            action.original_plan.draft_message = decision.edited_message;
            action.execution_status = 'APPROVED';
        }

        AuditLog.log(action, 'DECISION_MADE');
        FeedbackRecorder.recordDecision(decision.decision, {
            id: action.action_plan_id,
            reason: action.original_plan.reasoning
        });

        return action;
    }
}
