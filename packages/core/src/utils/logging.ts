/**
 * Logging Utilities - Safe object serialization for logging
 */

/**
 * Safely serialize objects for logging
 * Prevents circular reference errors and safely handles various object types.
 */
export function serializeForLog(obj: unknown): unknown {
  try {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'unknown error';
    return `[Unserializable object: ${errorMsg}]`;
  }
}

/**
 * Truncate a string to a maximum length
 * If the string exceeds maxLength, appends "..." to indicate truncation.
 */
export function truncateString(str: string, maxLength: number = 500): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Sanitize sensitive headers from logging
 * Masks values of headers that typically contain sensitive information.
 */
export function sanitizeHeadersForLog(headers?: Record<string, any>): Record<string, string> | undefined {
  if (!headers) return undefined;
  
  const sensitiveKeys = ['authorization', 'api-key', 'x-api-key', 'password', 'token', 'cookie', 'set-cookie'];
  const sanitized: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.includes(lowerKey)) {
      sanitized[key] = 'REDACTED';
    } else {
      sanitized[key] = String(value);
    }
  }
  
  return sanitized;
}

/**
 * Create a safe log object from an error
 * Extracts relevant error information in a standardized format suitable for logging.
 */
export function errorToLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
    };
  }
  
  if (typeof error === 'object' && error !== null) {
    return serializeForLog(error) as Record<string, unknown>;
  }
  
  return {
    type: typeof error,
    message: String(error),
  };
}
