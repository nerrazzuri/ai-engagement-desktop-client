
/**
 * Automation Policy Thresholds (Phase 25)
 * Strict, explicit, auditable.
 */
export const AutomationPolicy = {
    // History & Trust
    MIN_APPROVED_SUGGESTIONS: 20, // Must have successfully approved 20 suggestions
    MIN_APPROVAL_RATE: 0.8,       // 80% approval rate
    MAX_RECENT_REJECTIONS: 3,     // Max 3 rejections in last 7 days
    HISTORY_WINDOW_DAYS: 7,       // Lookback window for rejections

    // Confidence
    MIN_CONFIDENCE_THRESHOLD: 0.90, // Extremely high confidence required

    // Constraints
    DEFAULT_DAILY_LIMIT: 5,        // If allowed, max 5 auto-replies/day (Phase 26)
    DEFAULT_TIME_WINDOW: "09:00-18:00"
};
