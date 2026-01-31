/**
 * GLS Adapter for Shopickup
 * 
 * GLS (hu-gls) is a major Hungarian and Eastern European logistics carrier.
 * 
 * Capabilities supported (Phase 2-3):
 * - LIST_PICKUP_POINTS: Fetch list of pickup points/delivery locations
 * - CREATE_PARCEL: Create single parcel (delegates to CREATE_PARCELS)
 * - CREATE_PARCELS: Create multiple parcels in batch via GLS MyGLS API
 * - CREATE_LABEL: Create single label/PDF (delegates to CREATE_LABELS)
 * - CREATE_LABELS: Create multiple labels/PDFs in batch via GLS PrintLabels
 * - TRACK: Track shipments and parcels (Phase 3)
 * 
 * IMPORTANT: This adapter is HU (Hungary) specific for parcel/label creation and tracking.
 * Pickup points support 20+ countries via public feed.
 * MyGLS API parcel and label creation is currently optimized for Hungary only.
 * Tracking (TRACK) is HU-focused but experimental for other countries.
 * 
 * Future capabilities (Phase 4+):
 * - CLOSE_SHIPMENT: Close shipments for label generation
 * - VOID_LABEL: Cancel/void labels
 * 
 * Pickup Points:
 * - Public, unauthenticated feed
 * - URL: https://map.gls-hungary.com/data/deliveryPoints/{country}.json
 * - Supported countries: AT, BE, BG, CZ, DE, DK, ES, FI, FR, GR, HR, HU, IT, LU, NL, PL, PT, RO, SI, SK, RS
 * 
 * MyGLS API (Parcel & Label Creation - HU Focus):
 * - Base URL: https://api.mygls.hu/ParcelService.svc (production)
 * - Test URL: https://api.test.mygls.hu/ParcelService.svc (testing)
 * - Authentication: HTTP Basic auth with SHA512-hashed password
 * - Other regions: CZ, HR, RO, SI, SK, RS (experimental support, not fully tested)
 * 
 * Tracking API (GetParcelStatuses - HU Focus):
 * - Base URL: https://api.mygls.hu/ParcelService.svc (production)
 * - Test URL: https://api.test.mygls.hu/ParcelService.svc (testing)
 * - Authentication: HTTP Basic auth with SHA512-hashed password
 * - Endpoint: GetParcelStatuses (SOAP/HTTP)
 * - Returns: Parcel status timeline with 40+ status codes (Appendix G)
 * 
 * Label Creation Flow:
 * 1. First create parcels via CREATE_PARCELS (receives parcel IDs)
 * 2. Then create labels via CREATE_LABELS (uses parcel IDs to generate PDFs)
 * 3. PDF bytes returned in rawCarrierResponse for integrator to store/upload
 */

import type {
  AdapterContext,
  Capability,
  CarrierAdapter,
  CreateParcelRequest,
  CreateParcelsRequest,
  CreateParcelsResponse,
  CreateLabelsResponse,
  CarrierResource,
  FetchPickupPointsRequest,
  FetchPickupPointsResponse,
  TrackingRequest,
  TrackingUpdate,
} from '@shopickup/core';
import { Capabilities } from '@shopickup/core';
import {
  fetchPickupPoints as fetchPickupPointsImpl,
  createParcel as createParcelImpl,
  createParcels as createParcelsImpl,
  createLabel as createLabelImpl,
  createLabels as createLabelsImpl,
  track as trackImpl,
} from './capabilities/index.js';

/**
 * GLS Adapter
 * 
 * Currently implements:
 * - LIST_PICKUP_POINTS: Fetches pickup points from public GLS feed (20+ countries)
 * - CREATE_PARCEL: Creates single parcel via GLS MyGLS API (HU-specific)
 * - CREATE_PARCELS: Creates multiple parcels in batch via GLS MyGLS API (HU-specific)
 * - CREATE_LABEL: Creates single label/PDF via GLS PrintLabels API (HU-specific)
 * - CREATE_LABELS: Creates multiple labels/PDFs in batch via GLS PrintLabels API (HU-specific)
 * - TRACK: Tracks parcels via GLS GetParcelStatuses API (HU-focused, experimental for other countries)
 */
export class GLSAdapter implements CarrierAdapter {
  readonly id = 'hu-gls';
  readonly displayName = 'GLS Hungary';

  readonly capabilities: Capability[] = [
    Capabilities.LIST_PICKUP_POINTS,
    Capabilities.CREATE_PARCEL,
    Capabilities.CREATE_PARCELS,
    Capabilities.CREATE_LABEL,
    Capabilities.TRACK,
  ];

  /**
   * Create a new GLS adapter instance
   */
  constructor() {
    // GLS adapter is currently stateless
    // Constructor exists for future configuration needs
  }

  /**
   * Fetch pickup points from GLS public feed
   * 
   * @param req Request with country code (required)
   * @param ctx Adapter context with HTTP client
   * @returns Response with list of pickup points
   */
  async fetchPickupPoints(req: FetchPickupPointsRequest, ctx: AdapterContext): Promise<FetchPickupPointsResponse> {
    return fetchPickupPointsImpl(req, ctx);
  }

  /**
   * Create a single parcel
   * 
   * Maps canonical Parcel to GLS format and submits via MyGLS API.
   * Delegates to createParcels for batch processing.
   * 
   * IMPORTANT: This is HU-specific implementation.
   * 
   * @param req Request with parcel and credentials
   * @param ctx Adapter context with HTTP client
   * @returns Response with created parcel ID
   */
  async createParcel(req: CreateParcelRequest, ctx: AdapterContext): Promise<CarrierResource> {
    return createParcelImpl(req, ctx, (batchReq) => this.createParcels(batchReq, ctx));
  }

  /**
   * Create multiple parcels in batch
   * 
   * Maps canonical Parcels to GLS format and submits via MyGLS PrepareLabels endpoint.
   * Handles partial failures - returns per-parcel status.
   * 
   * IMPORTANT: This is HU-specific implementation.
   * While GLS API supports CZ, HR, RO, SI, SK, RS, this adapter has been
   * tested and optimized for Hungary. Other countries may require adjustments.
   * 
   * @param req Request with parcels array and credentials
   * @param ctx Adapter context with HTTP client
   * @returns Response with per-parcel results and summary statistics
   */
  async createParcels(req: CreateParcelsRequest, ctx: AdapterContext): Promise<CreateParcelsResponse> {
    return createParcelsImpl(req, ctx);
  }

  /**
   * Create a single label (PDF) for an existing parcel
   * 
   * The parcelCarrierId should be a GLS parcel ID from a prior CreateParcels call.
   * This method delegates to createLabels for batch processing.
   * 
   * IMPORTANT: This is HU-specific implementation.
   * 
   * @param req Request with parcel carrier ID and credentials
   * @param ctx Adapter context with HTTP client
   * @returns Response with label file metadata and PDF bytes in rawCarrierResponse
   */
  async createLabel(req: any, ctx: AdapterContext): Promise<any> {
    return createLabelImpl(req, ctx, (batchReq) => this.createLabels(batchReq, ctx));
  }

    /**
     * Create multiple labels (PDFs) in batch
     * 
     * Takes GLS parcel IDs from prior CreateParcels calls and retrieves PDF labels
     * via the GLS PrintLabels endpoint.
     * 
     * Returns per-label metadata in files array and combined PDF bytes in rawCarrierResponse.
     * The integrator should extract rawCarrierResponse and store/upload it to cloud storage.
     * 
     * IMPORTANT: This is HU-specific implementation.
     * 
     * @param req Request with parcel carrier IDs and credentials
     * @param ctx Adapter context with HTTP client
     * @returns Response with file metadata, per-label results, and PDF bytes
     */
    async createLabels(req: any, ctx: AdapterContext): Promise<CreateLabelsResponse> {
      return createLabelsImpl(req, ctx);
    }

    /**
     * Track a parcel by tracking number
     * 
     * Returns a timeline of tracking events for the parcel.
     * 
     * IMPORTANT: This is HU-focused implementation. Experimental for other countries.
     * 
     * @param req Request with tracking number and optional credentials
     * @param ctx Adapter context with HTTP client
     * @returns TrackingUpdate with events timeline and current status
     */
    async track(req: TrackingRequest, ctx: AdapterContext): Promise<TrackingUpdate> {
      return trackImpl(req, ctx);
    }
}

// Export types for external use
export type { GLSDeliveryPoint, GLSDeliveryPointsFeed } from './types/index.js';
export * from './mappers/index.js';
