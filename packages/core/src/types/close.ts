/**
 * Close shipments (batch) types
 *
 * Some carriers require a batch "close" operation where multiple parcel
 * tracking numbers are submitted and the carrier returns manifests / receipts.
 */
import type { RequestOptions } from '../interfaces/carrier-adapter.js';

/** Request to close one or more shipments (carrier-specific semantics) */
export interface CloseShipmentsRequest {
  /** Tracking numbers / parcel identifiers to include in the closing request */
  trackingNumbers?: string[];

  /** Carrier credentials (structure is carrier-specific) */
  credentials?: Record<string, unknown>;

  /** Per-call options (e.g., useTestApi) */
  options?: RequestOptions;
}

/** Per-manifest result returned by carrier for close operation */
export interface CloseShipmentResult {
  /** Optional generated manifest id / reference */
  manifestId?: string;

  /** Optional raw manifest bytes (not required) */
  manifest?: unknown;

  /** Any per-item errors */
  errors?: Array<{ code?: string; message?: string }>;

  /** Any per-item warnings */
  warnings?: Array<{ code?: string; message?: string }>;

  /** Raw carrier response for this result */
  raw?: unknown;
}

/** Batch close response with per-item results and summary */
export interface CloseShipmentsResponse {
  results: CloseShipmentResult[];
  successCount: number;
  failureCount: number;
  totalCount: number;
  allSucceeded: boolean;
  allFailed: boolean;
  someFailed: boolean;
  summary: string;

  /** Raw carrier response (sanitized) for debugging / storage */
  rawCarrierResponse?: unknown;
}

// re-export types from this module via types index
