
/**
 * Canonical contract for AI Core capabilities.
 * THIS FILE IS PART OF THE FROZEN CORE INTERFACE.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type CapabilityVersion = 'v1';

export interface CapabilityRequest {
    version: CapabilityVersion;
    channel: string;
    input: {
        query: string;
        [key: string]: JsonValue | undefined;
    };
    context: {
        flow?: string;
        domain?: string;
        candidates?: JsonValue[]; // For ranking/filtering flows
        [key: string]: JsonValue | undefined;
    };
    // Standard Identity/Policy fields (added by Orchestrator/Engagement layer)
    tenant_id?: string;
    user_id?: string;
    plan?: string;
    constraints?: Record<string, JsonValue>;
}

export interface CapabilityResponse {
    kind: 'answer' | 'recommend' | 'error' | 'ignore';
    payload: JsonValue;
    citations?: JsonValue[];
    confidence?: number;
    telemetry?: JsonValue;
    policy_decisions?: JsonValue;
}
