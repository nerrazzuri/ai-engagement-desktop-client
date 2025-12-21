
export class FeedbackRecorder {
    static recordDecision(decision: 'APPROVE' | 'REJECT' | 'EDIT', details: any) {
        // Placeholder for metrics collection
        // e.g. Prometheus counter or DB write
        // console.log(`[FEEDBACK] Decision: ${decision}`, details);
    }
}
