/**
 * TrackingEvent domain type
 * A normalized status update in a parcel's journey
 */
export interface TrackingEvent {
    /** Timestamp of the event (ISO 8601 UTC) */
    timestamp: Date;
    /** Normalized status */
    status: TrackingStatus;
    /** Location information (optional) */
    location?: {
        city?: string;
        country?: string;
        facility?: string;
        latitude?: number;
        longitude?: number;
    };
    /** Human-readable description of the event */
    description: string;
    /** Raw carrier data for debugging/reference */
    raw?: unknown;
}
export type TrackingStatus = "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION" | "RETURNED" | "CANCELLED";
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
    /** Last update timestamp */
    lastUpdate: Date;
    /** Raw carrier response for debugging */
    raw?: unknown;
}
//# sourceMappingURL=tracking.d.ts.map