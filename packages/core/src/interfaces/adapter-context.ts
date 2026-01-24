import type { HttpClient } from './http-client.js';
import type { Logger } from './logger.js';

/**
 * Logging options for controlling verbosity of adapter operations
 */
export interface LoggingOptions {
  /**
   * Maximum number of items to log in array responses
   * Set to 0 to skip logging the array entirely
   * Set to Infinity to log all items (default)
   * Examples: 5 (log first 5 items), 100 (log first 100 items)
   */
  maxArrayItems?: number;

  /**
   * Maximum depth for nested object logging
   * Set to 0 to log only the type/count
   * Set to 1 to log top-level properties
   * Set to Infinity to log everything (default)
   */
  maxDepth?: number;

  /**
   * Whether to log raw carrier responses
   * false = skip logging raw response entirely
   * true = log full raw response (may be verbose)
   * "summary" = log only summary (count, keys, type)
   * Default: "summary"
   */
  logRawResponse?: boolean | "summary";

  /**
   * Whether to include nested metadata in logs
   * Useful for large responses with deep metadata
   * Default: false
   */
  logMetadata?: boolean;

  /**
   * Specific operations to suppress logging for
   * Examples: ["fetchPickupPoints", "track"]
   * If an operation is listed here, it will use silent mode
   */
  silentOperations?: string[];
}

/**
 * AdapterContext
 * Context passed to adapter methods containing injected dependencies
 */
export interface AdapterContext {
  /** Injected HTTP client (required) */
  http?: HttpClient;

  /** Optional logger instance */
  logger?: Logger;

  /** Optional telemetry client */
  telemetry?: TelemetryClient;

  /**
   * Optional logging configuration for this operation
   * Controls verbosity of response logging
   * Default: { logRawResponse: "summary", maxArrayItems: 10, maxDepth: 2 }
   */
  loggingOptions?: LoggingOptions;

  /**
   * Optional operation name for context-aware logging
   * Used to match against silentOperations
   * Examples: "fetchPickupPoints", "createLabel"
   */
  operationName?: string;
}

/**
 * TelemetryClient interface
 * Pluggable telemetry for metrics and tracing
 */
export interface TelemetryClient {
  recordHistogram(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void;

  incrementCounter(
    name: string,
    value?: number,
    tags?: Record<string, string>
  ): void;

  recordGauge(
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void;
}

