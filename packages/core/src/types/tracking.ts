/**
 * TrackingEvent domain type
 * A normalized status update in a parcel's journey
 * 
 * Each event represents a single tracking update from the carrier.
 * The `status` field is canonical (normalized across all carriers for consistent processing),
 * while `carrierStatusCode` preserves the original carrier-specific code for debugging and
 * carrier-specific business logic.
 * 
 * Example: Foxpost trace with status "CREATE" maps to canonical status "PENDING",
 * but carrierStatusCode preserves "CREATE" for reference.
 */
export interface TrackingEvent {
  /** Timestamp of the event (ISO 8601 UTC) */
  timestamp: Date;

  /** 
   * Normalized status (canonical across all carriers)
   * Used for generic processing, filtering, and UI display.
   * Examples: "PENDING", "IN_TRANSIT", "DELIVERED"
   */
  status: TrackingStatus;

  /** 
   * Original carrier-specific status code (optional)
   * Preserves the exact code from the carrier API (e.g., "CREATE", "HDINTRANSIT", "RECEIVE").
   * Useful for:
   * - Debugging and troubleshooting carrier-specific behavior
   * - Implementing carrier-specific logic or rules
   * - Auditing the original carrier state
   */
  carrierStatusCode?: string;

  /** Location information (optional) */
  location?: {
    city?: string;
    country?: string;
    facility?: string;
    latitude?: number;
    longitude?: number;
  };

  /** Human-readable description of the event (typically English) */
  description: string;

  /**
   * Human-readable description in alternative language (e.g., Hungarian for Foxpost)
   * Provided by carriers/adapters that support localized descriptions.
   * If not provided, fall back to `description` field.
   */
  descriptionLocalLanguage?: string;

  /** Raw carrier data for debugging/reference */
  raw?: unknown;
}

export type TrackingStatus =
  | "PENDING"             // Awaiting pickup
  | "IN_TRANSIT"          // In transit between facilities
  | "OUT_FOR_DELIVERY"    // Out for delivery today
  | "DELIVERED"           // Successfully delivered
  | "EXCEPTION"           // Exception (delay, damage, etc.)
  | "RETURNED"            // Returned to sender
  | "CANCELLED";          // Shipment cancelled

/**
 * Complete tracking information for a shipment
 */
export interface TrackingUpdate {
  /** Tracking number */
  trackingNumber: string;

  /** List of tracking events in chronological order */
  events: TrackingEvent[];

  /** Overall current status */
  status: TrackingStatus;

  /** Last update timestamp (null if no tracking events available) */
  lastUpdate: Date | null;

  /** Raw carrier response for debugging */
  rawCarrierResponse?: unknown;
}
