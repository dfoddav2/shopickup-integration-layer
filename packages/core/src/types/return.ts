/**
 * Return parcel types
 *
 * Represents a request to create a return shipment for an existing parcel.
 */

import type { RequestOptions } from '../interfaces/carrier-adapter.js';

/**
 * Item describing a parcel to be returned.
 */
export interface ReturnItem {
  /**
   * Carrier-specific parcel ID of the original parcel to return.
   */
  parcelCarrierId: string;
  /**
   * Optional unique barcode to assign to the return parcel.
   */
  uniqueBarcode?: string;
  /**
   * Optional reference code for the return.
   */
  refCode?: string;
}

/**
 * Request to create a single return parcel.
 */
export interface CreateReturnRequest {
  /**
   * The return item to create.
   */
  return: ReturnItem;
  /**
   * Credentials for the carrier API.
   */
  credentials: Record<string, unknown>;
  /**
   * Per-call options.
   */
  options?: RequestOptions;
}

/**
 * Request to create multiple return parcels in a single batch.
 */
export interface CreateReturnsRequest {
  /**
   * Array of return items to create.
   */
  returns: ReturnItem[];
  /**
   * Shared credentials for the entire batch.
   */
  credentials: Record<string, unknown>;
  /**
   * Shared options for the entire batch.
   */
  options?: RequestOptions;
}

/**
 * Result of deleting a parcel.
 */
export interface DeleteParcelResult {
  /**
   * Carrier-specific parcel ID that was deleted.
   */
  carrierId?: string;
  /**
   * Deletion status.
   */
  status: 'deleted' | 'failed';
  /**
   * Errors if deletion failed.
   */
  errors?: Array<{ code?: string; message: string; field?: string }>;
  /**
   * Raw carrier response for debugging.
   */
  raw?: unknown;
}

/**
 * Request to delete a parcel.
 */
export interface DeleteParcelRequest {
  /**
   * Carrier-specific parcel ID to delete.
   */
  parcelCarrierId: string;
  /**
   * Credentials for the carrier API.
   */
  credentials: Record<string, unknown>;
  /**
   * Per-call options.
   */
  options?: RequestOptions;
}

/**
 * Request to track multiple parcels in a single batch.
 */
export interface BatchTrackingRequest {
  /**
   * Array of tracking numbers to look up.
   */
  trackingNumbers: string[];
  /**
   * Credentials for the carrier API (if required).
   */
  credentials?: Record<string, unknown>;
  /**
   * Per-call options (e.g., useTestApi).
   */
  options?: RequestOptions;
}

import type { TrackingUpdate } from './tracking.js';

/**
 * Result for a single tracking number within a batch tracking response.
 */
export interface BatchTrackingResult {
  /**
   * The tracking number this result corresponds to.
   */
  trackingNumber: string;
  /**
   * Whether the lookup succeeded, returned empty, or failed.
   */
  status: 'found' | 'not_found' | 'failed';
  /**
   * Normalized tracking data when status is 'found'.
   */
  update?: TrackingUpdate;
  /**
   * Error details when status is 'failed'.
   */
  error?: { code?: string; message: string };
  /**
   * Raw carrier response for this tracking number.
   */
  raw?: unknown;
}

/**
 * Response from a batch tracking operation.
 */
export interface BatchTrackingResponse {
  /**
   * Per-item results.
   */
  results: BatchTrackingResult[];
  /**
   * Number of successful lookups.
   */
  successCount: number;
  /**
   * Number of failed lookups.
   */
  failureCount: number;
  /**
   * Total number of tracking numbers requested.
   */
  totalCount: number;
  /**
   * True when every item succeeded.
   */
  allSucceeded: boolean;
  /**
   * True when every item failed.
   */
  allFailed: boolean;
  /**
   * True when some succeeded and some failed.
   */
  someFailed: boolean;
  /**
   * Human-readable summary.
   */
  summary: string;
  /**
   * Raw carrier response for debugging.
   */
  rawCarrierResponse?: unknown;
}
