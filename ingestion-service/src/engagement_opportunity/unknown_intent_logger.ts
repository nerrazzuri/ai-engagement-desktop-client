
export interface UnknownIntentLog {
    comment_id?: string;
    raw_text: string;
    normalized_text: string;
    detected_intents: any[];
    reason: 'NO_MATCH' | 'LOW_CONFIDENCE' | 'AMBIGUOUS';
    timestamp: string;
}

export class UnknownIntentLogger {
    // In a real system, this would write to a DB or file.
    // For now, we stub it or log to console in debug mode.
    static log(data: UnknownIntentLog) {
        // console.log('[UnknownIntentLogger]', JSON.stringify(data));
        // Placeholder for persistent logging (Phase 17E?)
    }
}
