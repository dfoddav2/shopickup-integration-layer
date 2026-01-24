/**
 * Validation error for a carrier resource (parcel, label, etc.)
 * Distinct from ValidationError which is for input validation
 */
export interface ParcelValidationError {
  /** Field that failed validation */
  field?: string;
  /** Error code from carrier (e.g., "INVALID_APM_ID") */
  code?: string;
  /** Human-readable error message */
  message: string;
}

/**
 * CarrierResource
 * Universal return type for all adapter methods
 */
export interface CarrierResource {
  /**
   * Provider-assigned ID for this resource
   * Examples: shipment ID, parcel ID, label ID, tracking number
   */
  carrierId?: string;

  /**
   * Normalized status
   * Adapter-specific, but should be consistent within that adapter
   * Examples: "created", "pending", "completed", "failed"
   */
  status?: string;

  /**
   * Raw carrier JSON response
   * Stored for debugging and potential future use
   */
  raw?: unknown;

  /**
   * Validation errors encountered when processing this resource
   * Used when status is "failed" due to validation issues
   * Contains all errors for this resource, not just the first
   */
  errors?: ParcelValidationError[];

  /**
   * Optional metadata for carrier-specific quirks
   * Examples: { expiresAt: Date, returnLabel: true }
   */
  meta?: Record<string, unknown>;
}

/**
 * LabelCarrierResource
 * Extended CarrierResource for storing label-specific mapping information
 * Used to preserve file and page range information when storing labels via Store interface
 */
export interface LabelCarrierResource extends CarrierResource {
  /**
   * Reference to the label file ID (from LabelFileResource.id)
   */
  fileId?: string;

  /**
   * Page range in the file where this label resides
   */
  pageRange?: {
    start: number;
    end: number;
  };
}

/**
 * FailedCarrierResource
 * A CarrierResource that explicitly represents a failed operation
 * Used when status is "failed" to ensure carrierId is undefined
 */
export interface FailedCarrierResource extends CarrierResource {
  /**
   * Always undefined for failed resources
   */
  carrierId: undefined;

  /**
   * Always "failed" for failed resources
   */
  status: "failed";

  /**
   * Must contain validation or operation errors
   */
  errors: ParcelValidationError[];
}
