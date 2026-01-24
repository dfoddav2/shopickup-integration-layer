/**
 * Strongly-typed response types for adapter operations
 * These provide consistent structure for callers to handle results
 */

import type { CarrierResource } from '../interfaces/carrier-resource.js';

/**
 * Response from batch parcel creation operations
 * Provides per-item results and an overall summary
 * 
 * Use this for operations that can partially succeed.
 * Example: createParcels() returns 5 results, 3 succeeded, 2 failed
 * 
 * @example
 * ```typescript
 * const response: CreateParcelsResponse = await adapter.createParcels(req, ctx);
 * 
 * // Check overall success
 * if (response.allSucceeded) {
 *   console.log('All parcels created');
 * } else if (response.someFailed) {
 *   console.log('Partial success:', response.successCount, 'created');
 * } else if (response.allFailed) {
 *   console.log('All failed');
 * }
 * 
 * // Process individual results
 * response.results.forEach((result, idx) => {
 *   if (result.status === 'created') {
 *     console.log(`Parcel ${idx}: ${result.carrierId}`);
 *   } else {
 *     console.log(`Parcel ${idx}: ${result.errors?.map(e => e.message).join(', ')}`);
 *   }
 * });
 * ```
 */
export interface CreateParcelsResponse {
  /**
   * Per-item results from the batch operation
   * One CarrierResource per input parcel, in the same order
   */
  results: CarrierResource[];

  /**
   * Number of parcels that succeeded (status === 'created')
   */
  successCount: number;

  /**
   * Number of parcels that failed (status === 'failed')
   */
  failureCount: number;

  /**
   * Total number of parcels processed
   */
  totalCount: number;

  /**
   * Whether all parcels succeeded
   * True only if failureCount === 0 && totalCount > 0
   */
  allSucceeded: boolean;

  /**
   * Whether all parcels failed
   * True only if successCount === 0 && totalCount > 0
   */
  allFailed: boolean;

  /**
   * Whether operation had mixed results (some succeeded, some failed)
   * True only if successCount > 0 && failureCount > 0
   */
  someFailed: boolean;

   /**
     * Human-readable summary of the results
     * Examples:
     * - "All 5 parcels created successfully"
     * - "2 created, 3 failed"
     * - "All 4 parcels failed with validation errors"
     */
    summary: string;

    /**
     * Full raw carrier response from the HTTP call
     * Contains status code, headers, and parsed body
     * Useful for debugging, auditing, and later typing against carrier schemas
     * Optional: adapters may omit if HTTP client does not support response inspection
     */
    rawCarrierResponse?: unknown;
}

/**
 * Response from batch label creation operations
 * Provides per-item results and an overall summary
 * 
 * Similar structure to CreateParcelsResponse but for labels
 * Handles partial success (some labels generated, some failed)
 */
export interface CreateLabelsResponse {
  /**
   * Per-item results from the batch operation
   * One CarrierResource per input parcel ID, in the same order
   */
  results: CarrierResource[];

  /**
   * Number of labels that succeeded (status === 'created')
   */
  successCount: number;

  /**
   * Number of labels that failed (status === 'failed')
   */
  failureCount: number;

  /**
   * Total number of labels processed
   */
  totalCount: number;

  /**
   * Whether all labels succeeded
   * True only if failureCount === 0 && totalCount > 0
   */
  allSucceeded: boolean;

  /**
   * Whether all labels failed
   * True only if successCount === 0 && totalCount > 0
   */
  allFailed: boolean;

  /**
   * Whether operation had mixed results (some succeeded, some failed)
   * True only if successCount > 0 && failureCount > 0
   */
  someFailed: boolean;

  /**
   * Human-readable summary of the results
   * Examples:
   * - "All 5 labels generated successfully"
   * - "3 labels generated, 2 failed"
   * - "All labels failed"
   */
  summary: string;

  /**
   * Full raw carrier response from the HTTP call
   * For batch label endpoints, this is typically the PDF file or a reference to it
   */
  rawCarrierResponse?: unknown;
}

/**
 * Determines HTTP status code based on batch results
 * 
 * - 200 (OK): All parcels succeeded
 * - 207 (Multi-Status): Mixed results (some succeeded, some failed)
 * - 400 (Bad Request): All parcels failed
 * - 500 (Internal Server Error): Unexpected error
 * 
 * @param response - The CreateParcelsResponse from adapter
 * @returns HTTP status code to return to client
 */
export function getHttpStatusForBatchResponse(response: CreateParcelsResponse): 200 | 207 | 400 {
  if (response.allSucceeded) {
    return 200;
  } else if (response.allFailed) {
    return 400;
  } else {
    return 207; // Multi-Status
  }
}

/**
 * Determines HTTP status code based on label batch results
 * Same logic as parcel batch responses
 * 
 * @param response - The CreateLabelsResponse from adapter
 * @returns HTTP status code to return to client
 */
export function getHttpStatusForLabelBatchResponse(response: CreateLabelsResponse): 200 | 207 | 400 {
  if (response.allSucceeded) {
    return 200;
  } else if (response.allFailed) {
    return 400;
  } else {
    return 207; // Multi-Status
  }
}
