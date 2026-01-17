/**
 * CarrierError
 * Structured error type thrown by adapters
 * Allows integrators to decide retry and fallback logic based on error category
 */
export declare class CarrierError extends Error {
    /**
     * Error category determines retry strategy
     *
     * - "Validation": Bad request (400) — don't retry
     * - "Auth": Credentials invalid (401/403) — don't retry
     * - "RateLimit": Too many requests (429) — retry with backoff
     * - "Transient": Server error, timeout, network error — retry
     * - "Permanent": Unrecoverable error — don't retry
     */
    readonly category: "Validation" | "Auth" | "RateLimit" | "Transient" | "Permanent";
    /**
     * Carrier-specific error code (e.g., "ERR_INVALID_ADDRESS")
     */
    readonly carrierCode?: string;
    /**
     * Raw carrier error response for debugging
     */
    readonly raw?: unknown;
    /**
     * Suggested retry delay in milliseconds (for RateLimit errors)
     */
    readonly retryAfterMs?: number;
    constructor(message: string, category: "Validation" | "Auth" | "RateLimit" | "Transient" | "Permanent", opts?: {
        carrierCode?: string;
        raw?: unknown;
        retryAfterMs?: number;
    });
    /**
     * Determine if this error should be retried
     */
    isRetryable(): boolean;
}
/**
 * NotImplementedError
 * Thrown when a capability is called but not implemented
 */
export declare class NotImplementedError extends Error {
    constructor(capability: string, adapterId: string);
}
/**
 * ValidationError
 * Thrown when input validation fails
 */
export declare class ValidationError extends Error {
    readonly details?: Record<string, unknown> | undefined;
    constructor(message: string, details?: Record<string, unknown> | undefined);
}
//# sourceMappingURL=index.d.ts.map