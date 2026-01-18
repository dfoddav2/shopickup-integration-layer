import type { Capability } from './capabilities.js';
import type { AdapterContext } from './adapter-context.js';
import type { CarrierResource } from './carrier-resource.js';
import type { Shipment, Parcel, RatesResponse, TrackingUpdate } from '../types.js';

/**
 * Request types for adapter methods
 */

export interface RatesRequest {
  shipment: Shipment;
  parcels: Parcel[];
  services?: string[];
}

export interface CreateShipmentRequest {
  shipment: Shipment;
  credentials: Record<string, unknown>;
}

export interface CreateParcelRequest {
  shipment: Shipment;
  parcel: Parcel;
  credentials: Record<string, unknown>;
}

export interface PickupRequest {
  shipment: Shipment;
  preferredDate?: Date;
  instructions?: string;
  credentials: Record<string, unknown>;
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
   * Fetch available rates for a shipment
   * Capability: RATES
   */
  getRates?(
    req: RatesRequest,
    ctx: AdapterContext
  ): Promise<RatesResponse>;

  /**
   * Create a shipment
   * Some carriers require this before parcels
   * Capability: CREATE_SHIPMENT
   */
  createShipment?(
    req: CreateShipmentRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

  /**
   * Add a parcel to a shipment
   * Capability: CREATE_PARCEL
   */
  createParcel?(
    shipmentCarrierId: string,
    req: CreateParcelRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

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
   */
  createLabel?(
    parcelCarrierId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource & { labelUrl?: string | null }>;

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
    trackingNumber: string,
    ctx: AdapterContext
  ): Promise<TrackingUpdate>;

  /**
   * Request a pickup from the shipper location
   * Capability: PICKUP
   */
  requestPickup?(
    req: PickupRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource>;
}
