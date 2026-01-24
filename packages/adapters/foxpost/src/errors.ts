import { CarrierError } from "@shopickup/core";

/**
 * Foxpost-specific error code translations
 */
const FoxpostErrorCodes: Record<string, { category: string; message: string }> = {
  WRONG_USERNAME_OR_PASSWORD: {
    category: "Auth",
    message: "Invalid Foxpost credentials",
  },
  INVALID_APM_ID: {
    category: "Validation",
    message: "Invalid APM (locker) ID",
  },
  INVALID_RECIPIENT: {
    category: "Validation",
    message: "Invalid recipient information",
  },
  INVALID_ADDRESS: {
    category: "Validation",
    message: "Invalid address provided",
  },
};

/**
 * Extract HTTP status code from error object
 * Works with errors from different HTTP clients (axios, fetch, undici, custom)
 * 
 * Supports common error shapes:
 * - axios: error.response.status
 * - fetch: error.status (when wrapped)
 * - undici: error.statusCode
 * - generic: error.response?.status or error.status
 */
function extractHttpStatus(error: unknown): number | undefined {
  const anyErr = error as any;
  
  // Try multiple common locations for HTTP status
  return (
    anyErr?.response?.status ??    // axios, fetch-like wrappers
    anyErr?.status ??              // direct status property
    anyErr?.statusCode ??          // undici, some node wrappers
    anyErr?.code === 'ECONNREFUSED' ? undefined : undefined  // network error, not HTTP status
  );
}

/**
 * Extract response body from error object
 * Works with errors from different HTTP clients
 * 
 * Supports common error shapes:
 * - axios: error.response.data
 * - fetch: error.response?.json() or error.data
 * - undici: error.body or error.data
 */
function extractResponseBody(error: unknown): unknown {
  const anyErr = error as any;
  
  return (
    anyErr?.response?.data ??     // axios, generic response objects
    anyErr?.data ??               // direct data property (undici, fetch wrappers)
    anyErr?.body ??               // node-fetch, undici
    anyErr?.response             // fallback to whole response
  );
}

/**
 * Extract error code from response body
 * Looks for common field names across different APIs
 */
function extractErrorCode(responseBody: unknown): string | undefined {
  const body = responseBody as any;
  
  return (
    body?.error ??                // common JSON API error field
    body?.code ??                 // error code field
    body?.errorCode ??            // camelCase variant
    body?.error_code              // snake_case variant
  );
}

/**
 * Translate Foxpost errors to structured CarrierError
 * 
 * Supports errors from any HTTP client implementation:
 * - axios
 * - node-fetch
 * - undici
 * - custom HTTP clients
 * - network errors
 * 
 * Error categorization:
 * - 400: Validation (client error, don't retry)
 * - 401/403: Auth (authentication failure, check credentials)
 * - 429: RateLimit (rate limited, retry with backoff)
 * - 5xx: Transient (server error, retry)
 * - Network: Transient (connection issue, retry)
 */
export function translateFoxpostError(error: unknown): CarrierError {
  const anyErr = error as any;

  // Extract common error properties in a client-agnostic way
  const status = extractHttpStatus(error);
  const responseBody = extractResponseBody(error);
  const errorCode = extractErrorCode(responseBody) || (typeof status === 'number' ? `HTTP_${status}` : undefined);
  const errorMapping = errorCode ? FoxpostErrorCodes[errorCode as string] : undefined;

  // Construct metadata with all available context
  const meta = {
    carrierCode: errorCode,
    raw: responseBody ?? anyErr,
  };

  // Route by HTTP status code
  if (typeof status === 'number') {
    if (status === 400) {
      return new CarrierError(
        `Validation error: ${errorMapping?.message || (responseBody as any)?.error || "Bad request"}`,
        "Validation" as any,
        meta
      );
    }
    
    if (status === 401 || status === 403) {
      return new CarrierError(
        "Foxpost credentials invalid",
        "Auth" as any,
        meta
      );
    }
    
    if (status === 429) {
      return new CarrierError(
        "Foxpost rate limit exceeded",
        "RateLimit" as any,
        { ...meta, retryAfterMs: 60000 }
      );
    }
    
    if (status >= 500) {
      return new CarrierError(
        "Foxpost server error",
        "Transient" as any,
        meta
      );
    }
  }

  // Network error (Error instance with no HTTP status)
  if (error instanceof Error) {
    return new CarrierError(
      `Foxpost connection error: ${error.message}`,
      "Transient" as any,
      { raw: anyErr }
    );
  }

  // Unknown error shape
  return new CarrierError(
    "Unknown Foxpost error",
    "Permanent" as any,
    { raw: anyErr }
  );
}