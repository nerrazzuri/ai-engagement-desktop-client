
import { LLMProvider, MockProvider } from '../../llm/provider';
import { OpenAIProvider } from '../../llm/openai';
import { RagClient, MockRagClient } from '../../rag/rag_client';
import { BrainResponse } from '../types';
import { config } from '../../../config';

// ==========================================
// Phase 17: Runtime Concerns
// ==========================================

// 1. Providers
const apiKey = config.openaiApiKey;
export const llmProvider: LLMProvider = (apiKey && apiKey.startsWith('sk-'))
    ? new OpenAIProvider(apiKey)
    : new MockProvider();

export const ragClient: RagClient = new MockRagClient();

// 2. State (Cache & Circuit Breaker)
export const resultCache = new Map<string, BrainResponse>();

export const circuitBreaker = {
    failureCount: 0,
    lastFailureTime: 0,
    // Constants
    FAILURE_THRESHOLD: 3,
    RESET_TIMEOUT: 60000
};
