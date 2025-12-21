import { ControlledAction } from './types';
import { EngagementActionPlan } from '../engagement_action/types';
import * as crypto from 'crypto';

export class ApprovalQueue {
    private static queue: ControlledAction[] = [];

    static enqueue(plan: EngagementActionPlan): ControlledAction {
        const item: ControlledAction = {
            action_plan_id: crypto.randomUUID(),
            original_plan: plan,
            execution_status: 'PENDING'
        };
        this.queue.push(item);
        return item;
    }

    static listPending(): ControlledAction[] {
        return this.queue.filter(i => i.execution_status === 'PENDING')
            .sort((a, b) => b.original_plan.priority - a.original_plan.priority);
    }

    static getById(id: string): ControlledAction | undefined {
        return this.queue.find(i => i.action_plan_id === id);
    }

    // For testing/mocking
    static clear() {
        this.queue = [];
    }
}
