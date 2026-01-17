/**
 * CarrierError
 * Structured error type thrown by adapters
 * Allows integrators to decide retry and fallback logic based on error category
 */
export class CarrierError extends Error {
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

  constructor(
    message: string,
    category: "Validation" | "Auth" | "RateLimit" | "Transient" | "Permanent",
    opts?: {
      carrierCode?: string;
      raw?: unknown;
      retryAfterMs?: number;
    }
  ) {
    super(message);
    Object.setPrototypeOf(this, CarrierError.prototype);
    this.name = "CarrierError";
    this.category = category;
    this.carrierCode = opts?.carrierCode;
    this.raw = opts?.raw;
    this.retryAfterMs = opts?.retryAfterMs;
  }

  /**
   * Determine if this error should be retried
   */
  isRetryable(): boolean {
    return this.category === "RateLimit" || this.category === "Transient";
  }
}

/**
 * NotImplementedError
 * Thrown when a capability is called but not implemented
 */
export class NotImplementedError extends Error {
  constructor(capability: string, adapterId: string) {
    super(
      `Capability '${capability}' is not implemented by adapter '${adapterId}'`
    );
    Object.setPrototypeOf(this, NotImplementedError.prototype);
    this.name = "NotImplementedError";
  }
}

/**
 * ValidationError
 * Thrown when input validation fails
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, ValidationError.prototype);
    this.name = "ValidationError";
  }
}
