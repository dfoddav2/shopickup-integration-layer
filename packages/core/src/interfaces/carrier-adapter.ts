import type { Capability } from './capabilities.js';
import type { AdapterContext } from './adapter-context.js';
import type { CarrierResource } from './carrier-resource.js';
import type { Parcel, RatesResponse, TrackingUpdate, CreateParcelsResponse, CreateLabelsResponse, LabelResult, FetchPickupPointsRequest, FetchPickupPointsResponse, ShipmentDetailsResponse } from '../types/index.js';

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
   * Credentials for the carrier API
   * 
   * Structure varies by carrier:
   * - Foxpost: { apiKey: string, basicUsername?: string, basicPassword?: string }
   * - DHL: { consignmentNumber: string, password: string }
   * - Etc.
   * 
   * Note: Different adapters require different credential fields.
   * Each adapter should validate credentials at runtime and throw CarrierError("Auth")
   * if required fields are missing.
   * 
   * Never store credentials in environment variables accessed from adapters —
   * integrators should read from process.env/secrets and pass via context.
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
   * 
   * Structure varies by carrier - see CreateParcelRequest.credentials for details.
   * Adapters validate at runtime and throw CarrierError("Auth") if invalid.
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
   * 
   * Structure varies by carrier - see CreateParcelRequest.credentials for details.
   * Adapters validate at runtime and throw CarrierError("Auth") if invalid.
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
     * 
     * - Used by: Foxpost
     */
    size?: string;
    /**
     * Starting position on page (carrier-specific)
     * For A7 labels on A4 page: 1-7
     * Ignored for other sizes
     * 
     * - Used by: Foxpost
     */
    startPos?: number;
    /**
     * Direction of label printing on page
     * 
     * - Used by: Foxpost
     */
    isPortrait?: boolean;
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
   * 
   * Structure varies by carrier - see CreateParcelRequest.credentials for details.
   * Adapters validate at runtime and throw CarrierError("Auth") if invalid.
   */
  credentials: Record<string, unknown>;
  /**
   * Shared options for the entire batch (size, startPos, etc.)
   */
  options?: RequestOptions & {
    /**
     * Label size/format (carrier-specific)
     * Examples: "A6", "A7", "4x6", "85x85"
     * 
     * - Used by: Foxpost
     */
    size?: string;
    /**
     * Starting position on page (carrier-specific, e.g., 1-7 for A7)
     * 
     * - Used by: Foxpost
     */
    startPos?: number;
    /**
     * Direction of label printing on page
     * 
     * - Used by: Foxpost
     */
    isPortrait?: boolean;
  };
}

export interface TrackingRequest {
  /**
   * Tracking number of the parcel to track
   */
  trackingNumber: string;
  /**
   * Credentials for the carrier API (if required for tracking)
   * 
   * Structure varies by carrier - see CreateParcelRequest.credentials for details.
   * Optional for some carriers (e.g., public tracking endpoints).
   */
  credentials?: Record<string, unknown>;
  /**
   * Per-call options (e.g., useTestApi)
   */
  options?: RequestOptions;
}

export interface ShipmentDetailsRequest {
  /**
   * Tracking/shipment number to get details for
   */
  trackingNumber: string;
  /**
   * Credentials for the carrier API (if required)
   * 
   * Structure varies by carrier - see CreateParcelRequest.credentials for details.
   * Optional for some carriers (e.g., public tracking endpoints).
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
  /**
   * Generate a label for a single parcel
   * Capability: CREATE_LABEL
   * 
   * Returns LabelResult with file mapping and metadata
   * Delegates to createLabels for batch-first implementation
   */
  createLabel?(
    req: CreateLabelRequest,
    ctx: AdapterContext
  ): Promise<LabelResult>;

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

  /**
   * Get shipment details/metadata by tracking number
   * Capability: GET_SHIPMENT_DETAILS
   * 
   * Returns shipment metadata (sender, recipient, items, etc.)
   * Note: This is different from tracking which returns tracking events
   */
  getShipmentDetails?(
    req: ShipmentDetailsRequest,
    ctx: AdapterContext
  ): Promise<ShipmentDetailsResponse>;

  /**
   * Fetch list of pickup points (APMs, lockers, etc.) from the carrier
   * Capability: LIST_PICKUP_POINTS
   */
  fetchPickupPoints?(
    req: FetchPickupPointsRequest,
    ctx: AdapterContext
  ): Promise<FetchPickupPointsResponse>;
}
