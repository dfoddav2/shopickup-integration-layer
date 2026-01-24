import type { Capability } from './capabilities.js';
import type { AdapterContext } from './adapter-context.js';
import type { CarrierResource } from './carrier-resource.js';
import type { Parcel, RatesResponse, TrackingUpdate, CreateParcelsResponse, CreateLabelsResponse } from '../types/index.js';

/**
 * Request options
 * Per-call options that adapters can use to modify behavior
 */
export interface RequestOptions {
  /**
   * Use test/sandbox API endpoint instead of production
   * Some carriers have separate test APIs (e.g., Foxpost: webapi-test.foxpost.hu)
   * Default: false
   */
  useTestApi?: boolean;

  /**
   * Custom options for future extensibility
   */
  [key: string]: unknown;
}

/**
 * Request types for adapter methods
 */

export interface RatesRequest {
  /**
   * Array of parcels to get rates for
   * Each parcel contains complete shipping details (sender, recipient, weight, etc.)
   */
  parcels: Parcel[];
  /**
   * Optional: filter by specific services (e.g., ["standard", "express"])
   */
  services?: string[];
  /**
   * Per-call options (e.g., useTestApi)
   */
  options?: RequestOptions;
}

export interface CreateParcelRequest {
  /**
   * The parcel to create
   * Contains complete shipping details including sender/recipient addresses
   */
  parcel: Parcel;
  /**
   * Credentials for the carrier API (e.g., { apiKey, username, password })
   */
  credentials: Record<string, unknown>;
  /**
   * Per-call options (e.g., useTestApi)
   */
  options?: RequestOptions;
}

export interface CreateParcelsRequest {
  /**
   * Array of parcels to create in a single batch
   * Each parcel contains complete shipping details (sender, recipient, weight, etc.)
   */
  parcels: Parcel[];
  /**
   * Shared credentials for the entire batch
   */
  credentials: Record<string, unknown>;
  /**
   * Shared options for the entire batch
   */
  options?: RequestOptions;
}

export interface CreateLabelRequest {
  /**
   * Carrier-specific parcel ID to create label for
   */
  parcelCarrierId: string;
  /**
   * Credentials for the carrier API (if required for labeling)
   */
  credentials: Record<string, unknown>;
  /**
   * Per-call options (e.g., useTestApi, label size, startPos)
   */
  options?: RequestOptions & {
    /**
     * Label size/format (carrier-specific)
     * Examples: "A6", "A7", "4x6", "85x85"
     * Default depends on carrier (typically "A7" for Foxpost)
     */
    size?: string;
    /**
     * Starting position on page (carrier-specific)
     * For A7 labels on A4 page: 1-7
     * Ignored for other sizes
     */
    startPos?: number;
  };
}

/**
 * Request to create labels for multiple parcels in a single batch
 * Similar to CreateParcelsRequest but for label generation
 */
export interface CreateLabelsRequest {
  /**
   * Array of carrier-specific parcel IDs to generate labels for
   */
  parcelCarrierIds: string[];
  /**
   * Shared credentials for the entire batch
   */
  credentials: Record<string, unknown>;
  /**
   * Shared options for the entire batch (size, startPos, etc.)
   */
  options?: RequestOptions & {
    /**
     * Label size/format (carrier-specific)
     * Examples: "A6", "A7", "4x6", "85x85"
     */
    size?: string;
    /**
     * Starting position on page (carrier-specific, e.g., 1-7 for A7)
     */
    startPos?: number;
  };
}

export interface TrackingRequest {
  /**
   * Tracking number of the parcel to track
   */
  trackingNumber: string;
  /**
   * Credentials for the carrier API (if required for tracking)
   */
  credentials?: Record<string, unknown>;
  /**
   * Per-call options (e.g., useTestApi)
   */
  options?: RequestOptions;
}

/**
 * CarrierAdapter interface
 * The single contract all carriers must implement
 */
export interface CarrierAdapter {
  /**
   * Unique identifier for this carrier
   * Examples: "foxpost", "dhl", "ups", "fedex"
   */
  readonly id: string;

  /**
   * Display name for UI/logging
   * Examples: "Foxpost Hungary", "DHL Express"
   */
  readonly displayName?: string;

  /**
   * List of capabilities this adapter supports
   * Orchestrator checks this to decide which methods to call
   */
  readonly capabilities: Capability[];

  /**
   * Optional: declares dependencies for certain operations
   * Example: { createLabel: ["CLOSE_SHIPMENT"] }
   * means closeShipment() MUST be called before createLabel()
   */
  readonly requires?: {
    createLabel?: Capability[];
    voidLabel?: Capability[];
    track?: Capability[];
  };

  /**
   * Optional: called once at adapter instantiation to configure
   * base URL, timeouts, or other settings
   */
  configure?(opts: { baseUrl?: string; timeout?: number }): void;

  // ========== Capability Methods ==========

  /**
   * Fetch available rates for parcels
   * Capability: RATES
   */
  getRates?(
    req: RatesRequest,
    ctx: AdapterContext
  ): Promise<RatesResponse>;

  /**
   * Create a parcel
   * Capability: CREATE_PARCEL
   */
  createParcel?(
    req: CreateParcelRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

  /**
   * Create multiple parcels in one call
   * Capability: CREATE_PARCELS
   * 
   * Returns strongly-typed CreateParcelsResponse with:
   * - Per-item results (results: CarrierResource[])
   * - Summary statistics (successCount, failureCount, totalCount)
   * - Convenience flags (allSucceeded, allFailed, someFailed)
   * - Human-readable summary text
   * 
   * Allows callers to handle partial failures appropriately.
   */
  createParcels?(
    req: CreateParcelsRequest,
    ctx: AdapterContext
  ): Promise<CreateParcelsResponse>;

  /**
   * Close/finalize a shipment
   * Required by some carriers before labeling
   * Capability: CLOSE_SHIPMENT
   */
  closeShipment?(
    shipmentCarrierId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

   /**
    * Generate a label for a parcel
    * Capability: CREATE_LABEL
    * 
    * Can accept either:
    * - Original CreateLabelRequest (for backward compatibility)
    * - New extended request with size and startPos options
    */
   createLabel?(
     req: CreateLabelRequest,
     ctx: AdapterContext
   ): Promise<CarrierResource & { labelUrl?: string | null }>;

   /**
    * Generate labels for multiple parcels in one call
    * Capability: CREATE_LABEL (same as singular, but batch)
    * 
    * Returns strongly-typed CreateLabelsResponse with:
    * - Per-item results (results: CarrierResource[])
    * - Summary statistics (successCount, failureCount, totalCount)
    * - Convenience flags (allSucceeded, allFailed, someFailed)
    * - Raw PDF or batch response data
    * 
    * Some carriers (like Foxpost) return a single PDF with all labels.
    * Adapters handle the parsing and should return per-label results.
    */
   createLabels?(
     req: CreateLabelsRequest,
     ctx: AdapterContext
   ): Promise<CreateLabelsResponse>;

  /**
   * Void/cancel a label
   * Capability: VOID_LABEL
   */
  voidLabel?(
    labelId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

  /**
   * Track a parcel by tracking number
   * Capability: TRACK
   */
  track?(
    req: TrackingRequest,
    ctx: AdapterContext
  ): Promise<TrackingUpdate>;
}
