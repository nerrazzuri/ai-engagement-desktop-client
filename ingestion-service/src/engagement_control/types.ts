import { EngagementActionPlan } from '../engagement_action/types';

export interface ControlDecision {
    decision: 'APPROVE' | 'REJECT' | 'EDIT';
    edited_message?: string;
    decided_by: string;
    decided_at: string;
}

export interface ControlledAction {
    action_plan_id: string;
    original_plan: EngagementActionPlan;
    control_decision?: ControlDecision;
    execution_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
}
