/**
 * Close shipments (batch) types
 *
 * Some carriers require a batch "close" operation where multiple parcel
 * tracking numbers are submitted and the carrier returns manifests / receipts.
 */
import type { RequestOptions } from '../interfaces/carrier-adapter.js';
import type { LabelFileResource } from './label.js';

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

  /**
   * References into the parent `CloseShipmentsResponse.files` array, identifying which
   * manifest document(s) belong to this result (e.g., posting list, pallet posting list).
   */
  fileIds?: string[];

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

  /**
   * Manifest document files produced by the close operation (e.g., delivery note,
   * posting list PDF, pallet posting list PDF), structured the same way as label files.
   */
  files?: LabelFileResource[];

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
