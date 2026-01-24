/**
 * Logging Utilities for Adapters
 * 
 * Provides safe logging helpers that respect LoggingOptions
 * to prevent verbose logging of large carrier responses.
 */

import type { AdapterContext, LoggingOptions } from '../interfaces/index.js';
import type { Logger } from '../interfaces/logger.js';

/**
 * Default logging options
 * Conservative defaults to avoid polluting logs with large responses
 */
const DEFAULT_LOGGING_OPTIONS: Required<LoggingOptions> = {
  maxArrayItems: 10,
  maxDepth: 2,
  logRawResponse: 'summary',
  logMetadata: false,
  silentOperations: [],
};

/**
 * Check if logging should be suppressed for this operation
 */
export function isSilentOperation(
  ctx: AdapterContext,
  defaultSilentOps: string[] = []
): boolean {
  const operationName = ctx.operationName;
  if (!operationName) return false;

  const silentOps = [
    ...(ctx.loggingOptions?.silentOperations ?? defaultSilentOps),
    ...DEFAULT_LOGGING_OPTIONS.silentOperations,
  ];

  return silentOps.includes(operationName);
}

/**
 * Get merged logging options with defaults
 */
export function getLoggingOptions(ctx: AdapterContext): Required<LoggingOptions> {
  return {
    ...DEFAULT_LOGGING_OPTIONS,
    ...ctx.loggingOptions,
  };
}

/**
 * Safely truncate an object for logging
 * Respects maxDepth and maxArrayItems
 */
export function truncateForLogging(
  obj: any,
  options: Required<LoggingOptions>,
  currentDepth: number = 0
): any {
  // Check depth limit
  if (currentDepth >= options.maxDepth) {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      return `[Array: ${obj.length} items]`;
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      return `[Object: ${keys.length} keys]`;
    }
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    if (options.maxArrayItems === 0) {
      return `[Array: ${obj.length} items (truncated)]`;
    }

    const truncated = obj.slice(0, options.maxArrayItems);
    const mapped = truncated.map((item) =>
      truncateForLogging(item, options, currentDepth + 1)
    );

    if (obj.length > options.maxArrayItems) {
      return [
        ...mapped,
        `... and ${obj.length - options.maxArrayItems} more items`,
      ];
    }
    return mapped;
  }

  // Handle objects
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip metadata unless explicitly requested
      if (key === 'metadata' && !options.logMetadata) {
        result[key] = `[Object: metadata (${Object.keys(value as any).length} keys, omitted)]`;
        continue;
      }

      result[key] = truncateForLogging(value, options, currentDepth + 1);
    }
    return result;
  }

  return obj;
}

/**
 * Create a summary of raw carrier response
 * Returns summary info without the full payload
 */
export function summarizeRawResponse(raw: any): Record<string, any> {
  if (!raw) return { message: 'No raw response' };

  if (Array.isArray(raw)) {
    const firstItem = raw[0];
    const keys = firstItem ? Object.keys(firstItem) : [];
    return {
      type: 'array',
      count: raw.length,
      itemKeys: keys.slice(0, 5), // Show first 5 keys as sample
      itemCount: keys.length,
    };
  }

  if (typeof raw === 'object') {
    const keys = Object.keys(raw);
    return {
      type: 'object',
      keyCount: keys.length,
      keys: keys.slice(0, 10), // Show first 10 keys as sample
    };
  }

  return {
    type: typeof raw,
    value: String(raw).slice(0, 100), // Truncate to 100 chars
  };
}

/**
 * Safely log a response with size checks
 * Respects logging options to avoid verbose logs
 */
export function safeLog(
  logger: Logger | undefined,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data: Record<string, any>,
  ctx: AdapterContext,
  silentOperationNames: string[] = ['fetchPickupPoints']
): void {
  if (!logger) return;

  // Check if this operation should be silent
  if (isSilentOperation(ctx, silentOperationNames)) {
    return;
  }

  const options = getLoggingOptions(ctx);

  // Process the data object
  const processedData = { ...data };

  // Handle raw carrier responses
  if ('raw' in processedData) {
    if (options.logRawResponse === false) {
      // Skip logging raw entirely
      delete processedData.raw;
    } else if (options.logRawResponse === 'summary') {
      // Replace with summary
      processedData.raw = summarizeRawResponse(processedData.raw);
    } else {
      // Log full response with truncation
      processedData.raw = truncateForLogging(
        processedData.raw,
        options
      );
    }
  }

  // Handle rawCarrierResponse (alias for raw in some cases)
  if ('rawCarrierResponse' in processedData) {
    if (options.logRawResponse === false) {
      delete processedData.rawCarrierResponse;
    } else if (options.logRawResponse === 'summary') {
      processedData.rawCarrierResponse = summarizeRawResponse(
        processedData.rawCarrierResponse
      );
    } else {
      processedData.rawCarrierResponse = truncateForLogging(
        processedData.rawCarrierResponse,
        options
      );
    }
  }

  // Truncate any remaining large objects
  for (const key of Object.keys(processedData)) {
    const value = processedData[key];
    if (value && typeof value === 'object' && !key.startsWith('_')) {
      processedData[key] = truncateForLogging(value, options);
    }
  }

  // Log at the specified level
  logger[level](message, processedData);
}

/**
 * Create a debug-friendly object for logging responses
 * Useful for adapter implementations
 */
export function createLogEntry(
  baseInfo: Record<string, any>,
  response: any,
  ctx: AdapterContext,
  silentOperationNames: string[] = []
): Record<string, any> {
  const options = getLoggingOptions(ctx);

  if (isSilentOperation(ctx, silentOperationNames)) {
    return { suppressed: true, reason: 'Silent operation' };
  }

  const entry = { ...baseInfo };

  // Add response summary
  if (response) {
    if (Array.isArray(response)) {
      entry.responseCount = response.length;
      if (options.maxArrayItems > 0) {
        entry.responseSample = response.slice(0, Math.min(2, options.maxArrayItems));
      }
    } else if (typeof response === 'object') {
      const keys = Object.keys(response);
      entry.responseKeys = keys.slice(0, 5);
      entry.responseKeyCount = keys.length;
    }
  }

  return entry;
}
