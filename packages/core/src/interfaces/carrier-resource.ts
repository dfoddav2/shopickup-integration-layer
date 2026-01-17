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
   * Optional metadata for carrier-specific quirks
   * Examples: { expiresAt: Date, returnLabel: true }
   */
  meta?: Record<string, unknown>;
}
