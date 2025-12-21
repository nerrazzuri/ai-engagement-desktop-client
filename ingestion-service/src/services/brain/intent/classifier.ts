import * as fs from 'fs';
import * as path from 'path';
import { EngagementIntent, IntentClassificationResult, SignalCategory, SignalDef, DetectedSignal, BuyerIntentStrength } from '../types';
import { signalInferenceClient } from '../../signalInferenceClient';

export class IntentClassifier {
    private signals: Map<SignalCategory, SignalDef[]> = new Map();
    private isReady: boolean = false;
    private static instance: IntentClassifier;

    constructor() {
        this.loadSignals();
    }

    public static getInstance(): IntentClassifier {
        if (!this.instance) {
            this.instance = new IntentClassifier();
        }
        return this.instance;
    }

    public static async classify(text: string): Promise<IntentClassificationResult> {
        return this.getInstance().classify(text);
    }

    private loadSignals() {
        // Map filename to Category
        const categoryMap: Record<string, SignalCategory> = {
            'evaluative.json': 'EVALUATIVE',
            'context.json': 'CONTEXT',
            'attribute.json': 'ATTRIBUTE',
            'conditional.json': 'CONDITIONAL',
            'product_ref.json': 'PRODUCT_REF',
            'pronoun.json': 'PRONOUN',
            'problem.json': 'PROBLEM',
            'regret.json': 'REGRET',
            'interrogative_word.json': 'INTERROGATIVE_WORD',
            'interrogative_punct.json': 'INTERROGATIVE_PUNCT',
            'source.json': 'SOURCE',
            'praise.json': 'PRAISE',
            'social.json': 'SOCIAL',
            'hostile.json': 'HOSTILE',
            'preference.json': 'PREFERENCE',
            'usage_context.json': 'USAGE_CONTEXT'
        };

        const rulesDir = path.join(__dirname, 'signals', 'en');
        if (!fs.existsSync(rulesDir)) {
            console.warn(`[IntentClassifier] Signal directory not found: ${rulesDir}`);
            return;
        }

        try {
            const files = fs.readdirSync(rulesDir);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const category = categoryMap[file];
                if (!category) continue;

                const content = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
                const defs: SignalDef[] = JSON.parse(content);
                this.signals.set(category, defs);
            }
            this.isReady = true;
            console.log(`[IntentClassifier] Loaded signals from ${files.length} files.`);
        } catch (err) {
            console.error('[IntentClassifier] Failed to load signals:', err);
        }
    }

    private normalize(text: string): string {
        return text.toLowerCase().trim();
    }

    public async classify(text: string): Promise<IntentClassificationResult> {
        if (!this.isReady || !text) {
            return this.emptyResult();
        }

        const normalized = this.normalize(text);
        const detectedSignals = this.scanSignals(normalized);

        // DEBUG LOGGING
        console.log(`[Classifier] Text: "${text}"`);
        console.log(`[Classifier] Signals: ${detectedSignals.map(s => `${s.category}:${s.signal}`).join(', ')}`);

        let composition = this.composeIntent(detectedSignals);
        console.log(`[Classifier] Intent (Initial): ${composition.intent}, Strength: ${composition.strength}`);

        // ==========================================
        // Phase 18: Collaborative Signal Inference
        // ==========================================
        const isCandidate = composition.intent === 'UNKNOWN';
        const signalCount = detectedSignals.length;
        const rangeValid = signalCount >= 1 && signalCount <= 3;
        const hasPreference = detectedSignals.some(s => s.category === 'PREFERENCE');
        // Circuit breaker check could be added here if we had access to it, 
        // but SignalInferenceClient handles its own timeouts/failures silently.

        if (isCandidate && rangeValid && !hasPreference) {
            console.log('[Classifier] Triggering AI-Core Signal Inference...');
            const start = Date.now();
            const inferred = await signalInferenceClient.inferSignals(text, detectedSignals);

            if (inferred.length > 0) {
                console.log(`[Classifier] Inference Received (${Date.now() - start}ms): ${inferred.map(s => s.signal).join(', ')}`);

                // Merge safely
                const ids = new Set(detectedSignals.map(s => s.id));
                let newSignalsAdded = false;
                for (const s of inferred) {
                    // Avoid strict ID clash, but also maybe check signal text? 
                    // Assuming AI-Core returns valid signal structures compatible with our types.
                    if (!ids.has(s.id)) {
                        detectedSignals.push(s);
                        ids.add(s.id);
                        newSignalsAdded = true;
                    }
                }

                if (newSignalsAdded) {
                    const newComposition = this.composeIntent(detectedSignals);
                    console.log(`[Classifier] Intent (Post-Inference): ${newComposition.intent}`);

                    // Update only if changed (or indiscriminately, since it's the new truth)
                    composition = newComposition;
                }
            } else {
                console.log('[Classifier] No signals inferred.');
            }
        }

        return {
            intent: composition.intent,
            confidence: 1.0, // Deterministic
            detected_intents: [], // Deprecated
            strength: composition.strength,
            signals: detectedSignals,
            evidence: {
                matched_families: [],
                matched_signals: detectedSignals.map(s => s.signal),
                language: 'en',
                scores: {} as any
            }
        };
    }

    private scanSignals(text: string): DetectedSignal[] {
        const results: DetectedSignal[] = [];

        this.signals.forEach((defs, category) => {
            for (const def of defs) {
                // Determine if match
                // Simple inclusion check
                if (text.includes(def.signal.toLowerCase())) {
                    results.push({
                        category,
                        signal: def.signal,
                        id: def.id
                    });
                }
            }
        });
        return results;
    }

    private composeIntent(signals: DetectedSignal[]): { intent: EngagementIntent; strength: BuyerIntentStrength } {
        // Helper to check presence
        const has = (cat: SignalCategory) => signals.some(s => s.category === cat);

        // 1. POST_PURCHASE_REGRET
        // Logic: REGRET
        if (has('REGRET')) {
            return { intent: 'POST_PURCHASE_REGRET', strength: 'IMMEDIATE' };
        }

        // 2. LATENT_PURCHASE
        // Logic: (CONDITIONAL OR PREFERENCE) AND (PRODUCT_REF OR (PRONOUN AND ATTRIBUTE))
        // Constraint: Pronoun requires Attribute.
        // Update 17H: Preference implies latent.
        if (has('CONDITIONAL') || has('PREFERENCE')) {
            const hasProduct = has('PRODUCT_REF');
            const hasPronoun = has('PRONOUN');
            const hasAttribute = has('ATTRIBUTE');

            // Keep strict anchor to avoid "I wish" (abstract)
            // Update: Relax to (PROD or ATTR) to catch "not in this size" where pronoun might be ambiguous or missing.
            // Risk: "I wish I was taller" -> Silent Capture (Acceptable).
            if (hasProduct || hasAttribute || hasPronoun) {
                return { intent: 'LATENT_PURCHASE', strength: 'VERY_HIGH' };
            }
        }

        // 3. FIT_SUITABILITY
        // Logic: (EVALUATIVE) AND (CONTEXT OR USAGE_CONTEXT) AND (ATTRIBUTE OR PRODUCT_REF OR PRONOUN)
        // Update 17H: Allow "Strong/Relational" Evaluatives (suitable, fit, appropriate) to trigger without explicit anchor.
        if (has('EVALUATIVE')) {
            const hasContext = has('CONTEXT') || has('USAGE_CONTEXT');

            if (hasContext) {
                // Check for Strong Evaluatives
                const evaluativeSignals = signals.filter(s => s.category === 'EVALUATIVE');
                const strongKeywords = ['suitable', 'fit', 'appropriate'];
                const hasStrongEval = evaluativeSignals.some(s => strongKeywords.some(k => s.signal.includes(k)));

                if (hasStrongEval) {
                    return { intent: 'FIT_SUITABILITY', strength: 'HIGH' };
                }

                // Strict check for weak evaluatives (e.g. "Good", "Perfect", "Nice")
                if (has('ATTRIBUTE') || has('PRODUCT_REF') || has('PRONOUN')) {
                    return { intent: 'FIT_SUITABILITY', strength: 'HIGH' };
                }
            }
        }

        // 4. PROBLEM_SOLUTION
        // Logic: PROBLEM AND PRODUCT_REF
        if (has('PROBLEM') && has('PRODUCT_REF')) {
            return { intent: 'PROBLEM_SOLUTION', strength: 'HIGH' };
        }

        // 5. PRODUCT_INQUIRY
        // Logic: INTERROGATIVE_WORD AND (PRODUCT_REF OR PRONOUN) AND SOURCE
        // Constraint: Interrogative Word Required.
        if (has('INTERROGATIVE_WORD') && has('SOURCE')) {
            if (has('PRODUCT_REF') || has('PRONOUN')) {
                return { intent: 'PRODUCT_INQUIRY', strength: 'HIGH' };
            }
        }

        // 6. UNKNOWN CANDIDATE (vs NOISE)
        // Logic: Signals > 0 AND NOT (SOCIAL OR HOSTILE)
        // Praise Logic: Override IGNORE if Context exists.
        if (signals.length > 0) {
            const isHostile = has('HOSTILE') || has('SOCIAL'); // Social tracked as Ignore for now
            if (isHostile) return { intent: 'NOISE', strength: 'NONE' };

            const isPraise = has('PRAISE');
            if (isPraise) {
                // Check if context saves it
                const hasContext = has('CONTEXT') || has('USAGE_CONTEXT') || has('CONDITIONAL') || has('PREFERENCE');
                if (!hasContext) {
                    return { intent: 'NOISE', strength: 'NONE' }; // Pure Praise -> Ignore
                }
                // If Context exists + Praise -> It fell through FIT/LATENT, so it's UNKNOWN Intent (Candidate)
                return { intent: 'UNKNOWN', strength: 'LOW' };
            }

            // Default Unknown (Non-praise signals present)
            return { intent: 'UNKNOWN', strength: 'LOW' };
        }

        // Default NOISE
        return { intent: 'NOISE', strength: 'NONE' };
    }

    private emptyResult(): IntentClassificationResult {
        return {
            intent: 'NOISE',
            confidence: 0,
            detected_intents: [],
            strength: 'NONE',
            signals: [],
            evidence: { matched_families: [], matched_signals: [], language: 'en', scores: {} as any }
        };
    }
}
