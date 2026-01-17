import type { HttpClient } from "./http-client";
import type { Logger } from "./logger";

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
