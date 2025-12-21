
import { createHash } from 'crypto';
import { Strategy, StrategyType, BrainInput, BrainResponse, HistoricalSignals, ContextType, SpeakerRole, TemplateCategory } from './types';
import { llmProvider, ragClient, resultCache, circuitBreaker } from './runtime/context';
import { PromptVersion, renderPrompt } from '../llm/prompts';
import { ContextClassifier } from './context/context_classifier';
import { RoleResolver } from './context/role_resolver';
import { SafetyGate } from './context/safety_gate';

// ==========================================
// Phase 17: Brain Engine (Pure Intelligence)
// ==========================================

const RAG_CONFIDENCE_THRESHOLD = 0.7;

const StrategyRanker = {
    rank(input: BrainInput): Strategy[] {
        const strategies: Strategy[] = [];
        const text = input.event.content_text.toLowerCase();

        // Heuristic 1: Question Detection -> ANSWER
        if (text.includes('?') || text.includes('how') || text.includes('what')) {
            strategies.push({
                type: 'ANSWER',
                confidence: 0.85,
                rationale: 'Detected question indicators'
            });
        }

        // Heuristic 2: Hostility -> DE_ESCALATE or IGNORE
        const hostileWords = ['hate', 'stupid', 'bad', 'worst'];
        if (hostileWords.some(w => text.includes(w))) {
            strategies.push({
                type: 'DE_ESCALATE',
                confidence: 0.9,
                rationale: 'Detected hostile keywords'
            });
            strategies.push({
                type: 'IGNORE',
                confidence: 0.7,
                rationale: 'Hostility threshold met'
            });
        }

        // Heuristic 3: Positive/Neutral -> ACKNOWLEDGE
        strategies.push({
            type: 'ACKNOWLEDGE',
            confidence: 0.6, // Baseline
            rationale: 'Default engagement strategy'
        });

        // Sort by confidence
        return strategies.sort((a, b) => b.confidence - a.confidence);
    }
};

const HeuristicScorer = {
    adjust(strategies: Strategy[], history: HistoricalSignals): Strategy[] {
        // Outcome-Aware Adjustment
        const ignoreRate = history.total_suggestions > 0 ? history.ignored_count / history.total_suggestions : 0;

        return strategies.map(s => {
            let score = s.confidence;
            if (ignoreRate > 0.5 && s.type !== 'IGNORE') {
                score *= 0.8; // Penalty for high ignore rate
            }
            if (s.type === 'IGNORE' && ignoreRate > 0.5) {
                score *= 1.2; // Boost ignore if user likes to ignore
            }
            return { ...s, confidence: Math.min(0.99, score) };
        });
    }
};

const PromptComposer = {
    compose(strategy: Strategy, input: BrainInput): string {
        const tone = input.tenant.tone;
        let template = '';

        switch (strategy.type) {
            case 'ANSWER':
                template = tone === 'PROFESSIONAL'
                    ? "Thank you for the question. [Answer details]."
                    : "Hey! Great question. [Answer details].";
                break;
            case 'ACKNOWLEDGE':
                template = tone === 'PROFESSIONAL'
                    ? "We appreciate your feedback."
                    : "Thanks for watching! Glad you liked it.";
                break;
            case 'DE_ESCALATE':
                template = "We hear your concerns. Let's discuss this constructively.";
                break;
            case 'IGNORE':
                template = "[NO_REPLY]";
                break;
            default:
                template = "Thanks!";
        }

        // Append Version info for "Differentiation"
        if (input.request.regeneration_count > 0) {
            template += ` (Option ${input.request.regeneration_count + 1})`;
        }

        return template;
    }
};

export const BrainEngine = {
    async generateSuggestion(input: BrainInput): Promise<BrainResponse> {
        const startTime = Date.now();

        // 1. Ranking (Phase 13 Heuristic as 'Fast Path' / 'Candidate Generator')
        let rawRanking: Strategy[] = [];
        let topStrategy: Strategy;

        // Phase 17C: Engagement Intent Overrides
        if (input.intent_context?.forced_strategy) {
            topStrategy = {
                type: input.intent_context.forced_strategy,
                confidence: 1.0,
                rationale: `Forced by Intent: ${input.intent_context.intent}`
            };
            rawRanking = [topStrategy];
        } else {
            rawRanking = StrategyRanker.rank(input);
        }

        const adjustedRanking = HeuristicScorer.adjust(rawRanking, input.history);
        if (!topStrategy!) { // If not forced, pick from ranking
            topStrategy = adjustedRanking.sort((a, b) => b.confidence - a.confidence)[0];
        }

        // ==========================================
        // Phase 23: Context & Safety Layer
        // ==========================================

        // 1. Classify Context
        const contextType = ContextClassifier.classify(input);

        // 2. Resolve Role
        // Mock default settings if unavailable (Phase 20 compat)
        const effectiveSettings: any = input.ownerSettings || { aggressiveness: 'CONSERVATIVE' };

        // Construct IntentDecision for Resolver (reusing logic or mocking for now if intent_context missing)
        const intentDecision: any = {
            intent: input.intent_context?.intent || 'UNKNOWN',
            strength: input.intent_context?.score && input.intent_context.score > 0.8 ? 'HIGH' : 'LOW', // Simple map
        };

        const speakerRole = RoleResolver.resolve(contextType, intentDecision, effectiveSettings, topStrategy.confidence);

        // 3. Determine Template Category (Heuristic)
        // Default mapping based on Role
        let templateCategory = TemplateCategory.NEUTRAL_ADVICE;
        if (speakerRole === 'OWNER') templateCategory = TemplateCategory.OWNER_PROMOTIONAL; // Default for valid owners
        else if (speakerRole === 'ALTERNATIVE_PROVIDER') templateCategory = TemplateCategory.ALTERNATIVE_MENTION;
        else if (input.tenant.tone === 'PROFESSIONAL') templateCategory = TemplateCategory.NEUTRAL_ADVICE;
        else templateCategory = TemplateCategory.EXPERIENCE_BASED;

        // 4. Safety Gate
        const gateResult = SafetyGate.evaluate(contextType, speakerRole, templateCategory);

        if (!gateResult.allowed) {
            console.warn(`[Brain] Safety Gate Blocked: ${gateResult.violation}`);
            // Fallback to SILENT_CAPTURE or OBSERVATION
            return {
                text: "",
                strategy: 'SILENT_CAPTURE',
                confidence: 0,
                explanation: `Safety Block: ${gateResult.violation}`,
                decision_trace: {
                    context: {
                        context_type: contextType,
                        speaker_role: speakerRole,
                        template_category: templateCategory,
                        rationale: gateResult.violation || 'Blocked'
                    }
                },
                version: '3.2-safety-gate',
                cache_hit: false
            };
        }

        // 2. Hybrid Pipeline Decision
        // Check Circuit Breaker
        const now = Date.now();
        if (circuitBreaker.failureCount >= circuitBreaker.FAILURE_THRESHOLD && (now - circuitBreaker.lastFailureTime) < circuitBreaker.RESET_TIMEOUT) {
            console.warn('[Brain] Circuit Open - Fallback to Heuristic');
            return this.fallbackHeuristic(topStrategy, input, rawRanking, 'circuit_open', { used: false, reason: 'circuit_open' }, { contextType, speakerRole, templateCategory });
        }

        let ragMeta = { used: false, reason: 'skipped_strategy' };

        try {
            // RAG Gating Logic (Phase 15)
            let ragResult: any = null;
            let currentPromptVersion = PromptVersion.V2_HYBRID;

            // Only use RAG for factual strategies
            if (topStrategy.type === 'ANSWER' || topStrategy.type === 'ASK_FOLLOWUP') {
                try {
                    // Fail-safe RAG call with 800ms timeout
                    const ragPromise = ragClient.query({
                        query: input.event.content_text,
                        tenant_id: input.tenant.tenant_id,
                        max_snippets: 3
                    });

                    const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 800));

                    const result = await Promise.race([ragPromise, timeoutPromise]);

                    if (!result) {
                        ragMeta = { used: false, reason: 'timeout' };
                    }
                    else if (result.snippets.length > 0 && result.confidence > RAG_CONFIDENCE_THRESHOLD) {
                        ragResult = result;
                        currentPromptVersion = PromptVersion.V3_RAG_AUGMENTED;
                        ragMeta = {
                            confidence: ragResult.confidence,
                            source_count: result.sources.length,
                            sources: result.sources,
                            used: true
                        } as any;
                    } else {
                        ragMeta = { used: false, reason: 'low_confidence_or_empty' };
                    }
                } catch (ragErr) {
                    console.warn('[Brain] RAG Lookup Failed (Soft Fail):', ragErr);
                    ragMeta = { used: false, reason: 'lookup_failed' };
                    // Continue without RAG
                }
            }

            // Check Cache
            const ragSignature = ragResult ? createHash('sha256').update(ragResult.snippets.join('|')).digest('hex') : 'no_rag';
            const cacheKey = this.generateCacheKey(input, topStrategy.type, currentPromptVersion, ragSignature);

            if (resultCache.has(cacheKey)) {
                console.log('[Brain] Cache Hit', { key: cacheKey });
                const cached = resultCache.get(cacheKey)!;
                return { ...cached, cache_hit: true };
            }

            // 3. LLM Refinement
            const promptArgs = {
                tone: input.tenant.tone,
                platform: input.event.platform,
                strategy: topStrategy.type,
                rationale: topStrategy.rationale,
                ignored_count: input.history.ignored_count,
                user_intent: input.request.user_intent,
                video_title: input.event.video_id,
                author_name: input.event.author_name || 'Unknown',
                content_text: input.event.content_text,
                length_limit: 200,
                // RAG Context (only used if V3)
                context_snippets: ragResult ? ragResult.snippets.join('\n- ') : ''
            };

            const prompt = renderPrompt(currentPromptVersion, promptArgs);

            const llmResponse = await llmProvider.generateCompletion({
                prompt,
                temperature: 0.7,
                max_tokens: 150
            });

            const latency = Date.now() - startTime;

            // 4. Validation & Parsing
            let parsed;
            try {
                parsed = JSON.parse(llmResponse.text);
                // Basic Schema Check (Zod ideally, manual for now)
                if (!parsed.suggested_text || !parsed.strategy) throw new Error("Invalid structure");
            } catch (e) {
                console.error('[Brain] Invalid JSON from LLM:', e);
                throw new Error("LLM JSON Parse Error");
            }

            // Structured Logging
            console.log('[Brain] Completion Generated', {
                latency_ms: latency,
                provider: llmProvider.id,
                tokens: llmResponse.usage,
                strategy: parsed.strategy,
                rag_used: !!ragResult
            });

            const response: BrainResponse = {
                text: parsed.suggested_text,
                strategy: parsed.strategy as StrategyType,
                confidence: parsed.confidence || 0.8,
                explanation: parsed.explanation || "LLM Generated",
                decision_trace: {
                    ...parsed.decision_trace,
                    provider: llmProvider.id,
                    prompt_version: currentPromptVersion,
                    ranking_snapshot: rawRanking.map(s => s.type),
                    latency_ms: latency,
                    tokens: llmResponse.usage,
                    rag_meta: ragMeta,
                    context: {
                        context_type: contextType,
                        speaker_role: speakerRole,
                        template_category: templateCategory,
                        rationale: 'Safe Generation'
                    }
                },
                model: `${llmProvider.id}-hybrid`,
                version: '3.1-rag', // Bump version
                cache_hit: false
            };

            // Success - Reset Circuit
            circuitBreaker.failureCount = 0;
            // Cache
            resultCache.set(cacheKey, response);

            return response;

        } catch (err) {
            const errorMessage = (err as any).message || 'Unknown Error';

            // Check for configuration/implementation errors that shouldn't trip the circuit breaker
            const isConfigError = errorMessage.includes('not yet fully implemented') ||
                errorMessage.includes('API Key not configured');

            if (!isConfigError) {
                console.error('[Brain] LLM Failure Details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
                circuitBreaker.failureCount++;
                circuitBreaker.lastFailureTime = Date.now();
            } else {
                console.warn(`[Brain] LLM Skipped: ${errorMessage}`);
            }

            const cleanReason = isConfigError ? 'LLM_OFFLINE' : `fallback_error: ${errorMessage}`;
            return this.fallbackHeuristic(topStrategy, input, rawRanking, cleanReason, ragMeta, { contextType, speakerRole, templateCategory });
        }
    },

    fallbackHeuristic(strategy: Strategy, input: BrainInput, ranking: Strategy[], reason: string, ragMeta: any = {}, contextData?: any): BrainResponse {
        const text = PromptComposer.compose(strategy, input);
        return {
            text,
            strategy: strategy.type,
            confidence: strategy.confidence,
            explanation: `Fallback (${reason}): ${strategy.rationale}`,
            decision_trace: {
                fallback_reason: reason,
                ranking: ranking.map(s => s.type),
                rag_meta: ragMeta,
                context: contextData ? {
                    context_type: contextData.contextType,
                    speaker_role: contextData.speakerRole,
                    template_category: contextData.templateCategory,
                    rationale: 'Fallback Preserved'
                } : undefined
            },
            model: 'heuristic-only-fallback',
            version: '2.0-fallback',
            cache_hit: false
        };
    },

    generateCacheKey(input: BrainInput, strategy: string, promptVersion: string, ragSignature: string): string {
        const payload = JSON.stringify({
            content: input.event.content_text,
            strategy,
            ignored: input.history.ignored_count,
            regen: input.request.regeneration_count,
            tone: input.tenant.tone,
            p_ver: promptVersion,
            model: llmProvider.id,
            rag_sig: ragSignature,
            tenant: input.tenant.tenant_id
        });
        return createHash('sha256').update(payload).digest('hex');
    }
};
