/**
 * Generated types for Foxpost API
 * This file was generated from hu-foxpost.openapi.yaml
 * 
 * NOTE: This is a manual stub. In production, use openapi-typescript to generate
 * these types automatically:
 * npx openapi-typescript ../../carrier-docs/hu-foxpost/hu-foxpost.openapi.yaml --output ./src/types/generated.ts
 */

/**
 * Request to create a parcel
 */
export interface CreateParcelRequest {
  /** Name of recipient (required) */
  recipientName: string;

  /** Phone of recipient (required) */
  recipientPhone: string;

  /** Email of recipient (required) */
  recipientEmail: string;

  /** Size of the parcel: xs, s, m, l, xl */
  size?: "xs" | "s" | "m" | "l" | "xl";

  /** Country code (defaults to HU) */
  recipientCountry?: string;

  /** City of recipient (required for HD - home delivery) */
  recipientCity?: string;

  /** Postal code (required for HD) */
  recipientZip?: string;

  /** Street address (required for HD) */
  recipientAddress?: string;

  /** Cash on delivery amount */
  cod?: number;

  /** Delivery note for courier */
  deliveryNote?: string;

  /** Comment about parcel contents */
  comment?: string;

  /** Whether Foxpost will print the label */
  label?: boolean;

  /** Whether parcel is fragile */
  fragile?: boolean;

  /** Unique barcode (if customer provides one) */
  uniqueBarcode?: string;

  /** Reference code for tracking */
  refCode?: string;

  /** APM (automated parcel machine) ID for redirect */
  destination?: string;
}

/**
 * Field validation error
 */
export interface FieldError {
  /** Field name that has error */
  field: string;

  /** Validation error message */
  message: string;
}

/**
 * Response from parcel creation
 */
export interface CreateResponse {
  /** Whether all parcels were created successfully */
  valid: boolean;

  /** List of created parcels */
  parcels: Package[];
}

/**
 * Created parcel details
 */
export interface Package {
  /** Barcode assigned to this parcel */
  barcode?: string;

  /** Reference code */
  refCode?: string;

  /** Unique barcode if provided */
  uniqueBarcode?: string;

  /** Validation errors if any */
  errors?: FieldError[];
}

/**
 * Request to get batch tracking
 */
export interface BatchTrackRequest {
  barcodes: string[];
}

/**
 * Tracking status response
 */
export interface Statuses {
  /** Barcode of the parcel */
  barcode: string;

  /** When parcel was created */
  createdAt: string;

  /** List of tracking events */
  statuses: TrackDTO[];
}

/**
 * Single tracking event
 */
export interface TrackDTO {
  /** Track event ID */
  trackId?: number;

  /** Status code */
  status?: string;

  /** Human-readable status name */
  longName?: string;

  /** When this status occurred */
  statusDate?: string;

  /** Location information */
  location?: string;
}

/**
 * Tracking response for single parcel (NEW /api/tracking/{barcode} endpoint)
 * Based on Foxpost API v1 documentation section 6.3
 */
export interface TrackingResponse {
  /** Tracking number */
  trackingNumber?: string;

  /** The queried parcel's clFoxId */
  clFox: string;

  /** Expected delivery date (yyyy-mm-dd) */
  estimatedDelivery: string | null;

  /** Parcel type: "NORMAL", "RE", "XRE", "IRE", "C2B" */
  parcelType: "NORMAL" | "RE" | "XRE" | "IRE" | "C2B";

  /** Related (previous) parcel clFox for returns (RE, XRE, IRE only) */
  relatedParcel: string | null;

  /** Delivery type: "APM", "HD", "COLLECT" */
  sendType: "APM" | "HD" | "COLLECT";

  /** Array of tracking traces in reverse chronological order (latest first) */
  traces: TraceDTO[];
}

/**
 * Single tracking trace/event from the new tracking endpoint
 */
export interface TraceDTO {
  /** Long human-readable status name */
  longName?: string;

  /** Short status code/name */
  shortName?: string;

  /** Status code */
  status?: string;

  /** When this status occurred */
  statusDate?: string;

  /** Status station ID reference on foxpost.hu */
  statusStatidionId?: string;
}

/**
 * Tracking response for single parcel (LEGACY /tracking endpoint - keep for backwards compatibility)
 */
export interface Tracking {
  /** Barcode of the parcel */
  barcode: string;

  /** When parcel was created */
  createdAt: string;

  /** List of tracking events */
  statuses: TrackDTO[];
}

/**
 * Label information
 */
export interface LabelInfo {
  /** Barcode */
  barcode: string;

  /** Whether label can be generated */
  canGenerate?: boolean;

  /** PDF content if available */
  pdf?: string;
}

/**
 * API Error response
 */
export interface ApiError {
  /** Timestamp of error */
  timestamp?: string;

  /** Error code */
  error?: string;

  /** HTTP status */
  status?: number;
}
