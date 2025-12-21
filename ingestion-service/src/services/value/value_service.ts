
import { prisma } from '../../db';

export class ValueService {

    /**
     * Get high-level value summary (Funnel + Silent Value).
     */
    static async getSummary(workspaceId: string) {
        // 1. Funnel Metrics
        // Total Ingested (by this workspace's install)
        // Install <-> Account link is 1:1 usually, but events store account_id.

        const eventsIngested = await prisma.engagementEvent.count({
            where: { account_id: workspaceId }
        });

        // Suggestions created
        const suggestionsCreated = await prisma.suggestion.count({
            where: { workspace_id: workspaceId }
        });

        const suggestionsPending = await prisma.suggestion.count({
            where: { workspace_id: workspaceId, status: 'PENDING' }
        });

        // Decisions
        const decisions = await prisma.suggestionDecision.groupBy({
            by: ['decision'],
            where: { workspace_id: workspaceId },
            _count: { decision: true }
        });

        const approved = decisions.find(d => d.decision === 'APPROVE')?._count.decision || 0;
        const rejected = decisions.find(d => d.decision === 'REJECT')?._count.decision || 0;
        const edited = decisions.find(d => d.decision === 'EDIT')?._count.decision || 0;

        // 2. Silent Value (Blocks/Ignores)
        // We look for EngagementEvents with status='IGNORED' and parse metadata (LIMITATION: SQL cannot parse JSON easily in basic Prisma)
        // We will fetch IGNORED events and aggregate in memory (assuming reasonable volume for "Summary" or use raw query later)
        // Optimization: For Summary, we just count TOTAL ignored. Drill down does deep analysis.

        const ignoredEvents = await prisma.engagementEvent.findMany({
            where: { account_id: workspaceId, status: 'IGNORED' },
            select: { metadata: true }
        });

        const silentMetrics = {
            blocked_by_safety: 0,
            blocked_by_caps: 0,
            observe_only: 0,
            low_confidence: 0,
            other_ignore: 0
        };

        for (const ev of ignoredEvents) {
            try {
                const meta = JSON.parse(ev.metadata || '{}');
                const outcome = meta.value_outcome;
                if (!outcome) {
                    silentMetrics.other_ignore++;
                    continue;
                }
                const trace = outcome.trace || {};

                if (trace.safety_rule) silentMetrics.blocked_by_safety++;
                else if (trace.cap_reason) silentMetrics.blocked_by_caps++;
                else if (trace.mode === 'OBSERVE_ONLY') silentMetrics.observe_only++;
                else if (outcome.reason && outcome.reason.toLowerCase().includes('confidence')) silentMetrics.low_confidence++;
                else silentMetrics.other_ignore++;
            } catch (e) {
                silentMetrics.other_ignore++;
            }
        }

        return {
            funnel: {
                events_ingested: eventsIngested,
                opportunities_detected: suggestionsCreated + ignoredEvents.length, // Detect = Created + Ignored(processed)
                suggestions_created: suggestionsCreated,
                pending: suggestionsPending,
                approved: approved,
                rejected: rejected,
                edited: edited
            },
            silent_value: silentMetrics
        };
    }

    /**
     * Breakdown by Intent and Confidence.
     */
    static async getBreakdown(workspaceId: string) {
        const suggestions = await prisma.suggestion.findMany({
            where: { workspace_id: workspaceId },
            select: { signals: true, confidence: true, status: true }
        });

        const intentMap: Record<string, number> = {};
        const confidenceBands = {
            'low': 0, // < 0.7
            'medium': 0, // 0.7 - 0.85
            'high': 0 // > 0.85
        };

        for (const s of suggestions) {
            // Confidence
            if (s.confidence > 0.85) confidenceBands.high++;
            else if (s.confidence > 0.7) confidenceBands.medium++;
            else confidenceBands.low++;

            // Intent (Extract from signals)
            try {
                const signals = JSON.parse(s.signals || '{}');
                // Intent logic depends on what Brain Gateway puts in signals. 
                // Currently 'detected_intent' might be in signals or we infer?
                // Phase 21 verification output showed "intent": "NOISE" in trace.
                // Assuming signals has 'trace' -> 'intent'.
                const intent = signals.trace?.intent || 'UNKNOWN';
                intentMap[intent] = (intentMap[intent] || 0) + 1;
            } catch (e) {
                intentMap['UNKNOWN'] = (intentMap['UNKNOWN'] || 0) + 1;
            }
        }

        return {
            intents: intentMap,
            confidence_bands: confidenceBands
        };
    }

    /**
     * Timeline of decisions.
     */
    static async getDecisions(workspaceId: string) {
        const decisions = await prisma.suggestionDecision.findMany({
            where: { workspace_id: workspaceId },
            orderBy: { created_at: 'desc' },
            take: 100,
            include: { suggestion: { select: { created_at: true } } }
        });

        return decisions.map(d => ({
            id: d.id,
            suggestion_id: d.suggestion_id,
            decision: d.decision,
            reason: d.reason,
            timestamp: d.created_at,
            time_to_decide_ms: d.created_at.getTime() - d.suggestion.created_at.getTime()
        }));
    }
}
