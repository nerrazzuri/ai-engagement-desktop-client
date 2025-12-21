import { ControlledAction, ControlDecision } from './types';

export interface AuditEntry {
    timestamp: string;
    action_plan_id: string;
    event: 'QUEUED' | 'DECISION_MADE';
    details: any;
}

export class AuditLog {
    private static logs: AuditEntry[] = [];

    static log(action: ControlledAction, event: 'QUEUED' | 'DECISION_MADE') {
        const entry: AuditEntry = {
            timestamp: new Date().toISOString(),
            action_plan_id: action.action_plan_id,
            event: event,
            details: event === 'DECISION_MADE' ? action.control_decision : { plan: action.original_plan }
        };
        this.logs.push(entry);

        // In real system, write to file/DB
        // console.log(`[AUDIT]`, JSON.stringify(entry));
    }

    static getLogs(actionId?: string): AuditEntry[] {
        if (actionId) return this.logs.filter(l => l.action_plan_id === actionId);
        return this.logs;
    }

    static clear() {
        this.logs = [];
    }
}
