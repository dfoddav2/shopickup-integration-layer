/**
 * Foxpost Carrier Adapter
 * Implements the CarrierAdapter interface for Foxpost logistics
 */

import type {
  CarrierAdapter,
  Capability,
  AdapterContext,
  CreateParcelRequest,
  CreateParcelsRequest,
  TrackingRequest,
  RatesRequest,
  CreateParcelsResponse,
  CreateLabelRequest,
  CreateLabelResponse,
  CreateLabelsRequest,
  CreateLabelsResponse,
  CarrierResource,
  TrackingUpdate,
  FetchPickupPointsRequest,
  FetchPickupPointsResponse,
  DeleteParcelRequest,
  DeleteParcelResult,
  CreateReturnRequest,
  CreateReturnsRequest,
  BatchTrackingRequest,
  BatchTrackingResponse,
} from "@shopickup/core";
import { Capabilities, CarrierError, NotImplementedError } from "@shopickup/core";
import {
  createParcel as createParcelImpl,
  createParcels as createParcelsImpl,
  createLabel as createLabelImpl,
  createLabels as createLabelsImpl,
  track as trackImpl,
  fetchPickupPoints as fetchPickupPointsImpl,
  deleteParcel as deleteParcelImpl,
  createReturn as createReturnImpl,
  createReturns as createReturnsImpl,
  batchTrack as batchTrackImpl,
} from './capabilities/index.js';
import { createResolveBaseUrl, type ResolveBaseUrl } from './utils/resolveBaseUrl.js';
import type {
  CreateLabelRequestFoxpost,
  CreateLabelsRequestFoxpost,
  CreateParcelRequestFoxpost,
  CreateParcelsRequestFoxpost,
  DeleteParcelRequestFoxpost,
  CreateReturnRequestFoxpost,
  CreateReturnsRequestFoxpost,
  BatchTrackingRequestFoxpost,
} from './validation.js';

/**
 * FoxpostAdapter
 * 
 * Foxpost (hu-foxpost) is a major Hungarian logistics carrier.
 * 
 * Capabilities supported:
 * - CREATE_PARCEL: Create parcels directly
 * - CREATE_PARCELS: Batch create multiple parcels
 * - CREATE_LABEL: Generate PDF labels for parcels
 * - TRACK: Track parcels by barcode
 * - TEST_MODE_SUPPORTED: Can switch to test API for sandbox testing
 * 
 * Test API:
 * - Production: https://webapi.foxpost.hu
 * - Test/Sandbox: https://webapi-test.foxpost.hu
 * - Pass options.useTestApi = true in request to switch to test endpoint for that call
 * - Test API requires separate test credentials
 * 
 * Notes:
 * - Foxpost does NOT have a shipment concept; parcels are created directly
 * - Labels are generated per parcel
 * - Tracking available via barcode (FoxWeb barcode format: CLFOX...)
 * - createLabel does not support per-call test mode (no request object in interface)
 */
export class FoxpostAdapter implements CarrierAdapter {
  readonly id = "hu-foxpost";
  readonly displayName = "Foxpost Hungary";

  readonly capabilities: Capability[] = [
    Capabilities.CREATE_PARCEL,
    Capabilities.CREATE_PARCELS,
    Capabilities.CREATE_LABEL,
    Capabilities.TRACK,
    Capabilities.LIST_PICKUP_POINTS,
    Capabilities.TEST_MODE_SUPPORTED,
    Capabilities.DELETE_PARCEL,
    Capabilities.CREATE_RETURN,
    Capabilities.CREATE_RETURNS,
    Capabilities.BATCH_TRACK,
  ];

  // Foxpost doesn't require close before label
  readonly requires = {
    createLabel: [Capabilities.CREATE_PARCEL],
  };

  private prodBaseUrl = "https://webapi.foxpost.hu";
  private testBaseUrl = "https://webapi-test.foxpost.hu";
  private resolveBaseUrl: ResolveBaseUrl;

  constructor(baseUrl: string = "https://webapi.foxpost.hu") {
    this.prodBaseUrl = "https://webapi.foxpost.hu";
    this.testBaseUrl = "https://webapi-test.foxpost.hu";
    this.resolveBaseUrl = createResolveBaseUrl(this.prodBaseUrl, this.testBaseUrl);
  }

  /**
   * Create a parcel in Foxpost
   * 
   * Note: Shipper information is not sent to Foxpost API.
   * Foxpost derives the shipper from the API key's account settings.
   * We require shipper in the core Parcel type for consistency across adapters.
   * 
   * Maps canonical Parcel to Foxpost CreateParcelRequest (and carrier-specific type)
   * Returns the parcel barcode as carrierId
   */
  async createParcel(
    req: CreateParcelRequestFoxpost,
    ctx: AdapterContext
  ): Promise<CarrierResource>;
  async createParcel(
    req: CreateParcelRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    return createParcelImpl(req, ctx, (batchReq, batchCtx) =>
      this.createParcels(batchReq as CreateParcelsRequestFoxpost, batchCtx)
    );
  }

  /**
   * Create multiple parcels in one call
   * Maps canonical Parcel array to Foxpost CreateParcelRequest and calls the
   * Foxpost batch endpoint which accepts an array. Returns per-item CarrierResource
   * so callers can handle partial failures.
   * 
   * Validates both the incoming parcels and the mapped carrier-specific payloads.
   * 
   * @returns CreateParcelsResponse with summary and per-item results
   */
  async createParcels(
    req: CreateParcelsRequestFoxpost,
    ctx: AdapterContext
  ): Promise<CreateParcelsResponse>;
  async createParcels(
    req: CreateParcelsRequest,
    ctx: AdapterContext
  ): Promise<CreateParcelsResponse> {
    return createParcelsImpl(req, ctx, this.resolveBaseUrl);
  }

  /**
   * Create a label (generate PDF) for a parcel
   * 
   * @param req CreateLabelRequest with parcelCarrierId (Foxpost barcode)
   * @param ctx AdapterContext with HTTP client and logger
   * @returns LabelResult with file mapping and page range
   */
  async createLabel(
    req: CreateLabelRequestFoxpost,
    ctx: AdapterContext
  ): Promise<CreateLabelResponse>;
  async createLabel(
    req: CreateLabelRequest,
    ctx: AdapterContext
  ): Promise<CreateLabelResponse> {
    return createLabelImpl(req as CreateLabelRequestFoxpost, ctx, this.resolveBaseUrl);
  }

  /**
   * Create labels for multiple parcels in one batch call
   * 
   * Generates a single PDF with all requested labels using Foxpost POST /api/label/{pageSize}
   * Returns per-item results for tracking success/failure of each label
   * 
   * @param req CreateLabelsRequest with array of parcelCarrierIds
   * @param ctx AdapterContext with HTTP client and logger
   * @returns CreateLabelsResponse with per-item results and summary
   */
  async createLabels(
    req: CreateLabelsRequestFoxpost,
    ctx: AdapterContext
  ): Promise<CreateLabelsResponse>;
  async createLabels(
    req: CreateLabelsRequest,
    ctx: AdapterContext
  ): Promise<CreateLabelsResponse> {
    return createLabelsImpl(req as CreateLabelsRequestFoxpost, ctx, this.resolveBaseUrl);
  }

  /**
   * NOT IMPLEMENTED: Foxpost doesn't support voiding labels
   */
  async voidLabel(
    _labelId: string,
    _ctx: AdapterContext
  ): Promise<CarrierResource> {
    throw new NotImplementedError("VOID_LABEL", this.id);
  }

  /**
   * Track a parcel by its clFoxId or uniqueBarcode using the new GET /api/tracking/{barcode} endpoint
   * 
   * Returns normalized tracking information with all available traces in reverse chronological order
   * 
   * To use test API, pass in request as:
   * { trackingNumber: barcode, credentials: {...}, options?: { useTestApi: true } }
   */
  async track(
    req: TrackingRequest,
    ctx: AdapterContext
  ): Promise<TrackingUpdate> {
    return trackImpl(req, ctx, this.resolveBaseUrl);
  }

  /**
   * Delete a parcel from Foxpost by its barcode.
   * 
   * @param req DeleteParcelRequest with parcelCarrierId (Foxpost barcode)
   * @param ctx AdapterContext with HTTP client and logger
   * @returns DeleteParcelResult indicating success or failure
   */
  async deleteParcel(
    req: DeleteParcelRequestFoxpost,
    ctx: AdapterContext
  ): Promise<DeleteParcelResult>;
  async deleteParcel(
    req: DeleteParcelRequest,
    ctx: AdapterContext
  ): Promise<DeleteParcelResult> {
    return deleteParcelImpl(req, ctx, this.resolveBaseUrl);
  }

  /**
   * Create a return parcel for an existing shipment.
   * 
   * @param req CreateReturnRequest with original parcelCarrierId
   * @param ctx AdapterContext with HTTP client and logger
   * @returns CarrierResource with new return barcode
   */
  async createReturn(
    req: CreateReturnRequestFoxpost,
    ctx: AdapterContext
  ): Promise<CarrierResource>;
  async createReturn(
    req: CreateReturnRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    return createReturnImpl(req, ctx, this.resolveBaseUrl);
  }

  /**
   * Create multiple return parcels in one batch call.
   * 
   * @param req CreateReturnsRequest with array of return items
   * @param ctx AdapterContext with HTTP client and logger
   * @returns CreateParcelsResponse-style summary with per-item results
   */
  async createReturns(
    req: CreateReturnsRequestFoxpost,
    ctx: AdapterContext
  ): Promise<CreateParcelsResponse>;
  async createReturns(
    req: CreateReturnsRequest,
    ctx: AdapterContext
  ): Promise<CreateParcelsResponse> {
    return createReturnsImpl(req, ctx, this.resolveBaseUrl);
  }

  /**
   * Track multiple parcels in a single batch call.
   * 
   * @param req BatchTrackingRequest with array of trackingNumbers
   * @param ctx AdapterContext with HTTP client and logger
   * @returns BatchTrackingResponse with per-item results and summary
   */
  async batchTrack(
    req: BatchTrackingRequestFoxpost,
    ctx: AdapterContext
  ): Promise<BatchTrackingResponse>;
  async batchTrack(
    req: BatchTrackingRequest,
    ctx: AdapterContext
  ): Promise<BatchTrackingResponse> {
    return batchTrackImpl(req, ctx, this.resolveBaseUrl);
  }

  /**
   * Fetch list of Foxpost pickup points (APMs)
   * 
   * Fetches the public JSON feed from https://cdn.foxpost.hu/foxplus.json
   * which is updated hourly and contains all active APM locations.
   * 
   * No authentication is required as this is a public feed.
   * 
   * @param req FetchPickupPointsRequest (optional filters)
   * @param ctx AdapterContext with HTTP client
   * @returns FetchPickupPointsResponse with normalized pickup points
   */
  async fetchPickupPoints(
    req: FetchPickupPointsRequest,
    ctx: AdapterContext
  ): Promise<FetchPickupPointsResponse> {
    return fetchPickupPointsImpl(req, ctx);
  }

  /**
   * NOT IMPLEMENTED: Foxpost doesn't support pickup requests
   */
  async requestPickup(
    _req: any,
    _ctx: AdapterContext
  ): Promise<CarrierResource> {
    throw new NotImplementedError("PICKUP", this.id);
  }

  /**
   * NOT IMPLEMENTED: Foxpost doesn't expose rate quotes
   */
  async getRates(
    _req: RatesRequest,
    _ctx: AdapterContext
  ): Promise<any> {
    throw new NotImplementedError("RATES", this.id);
  }
}

export default FoxpostAdapter;

// Export validation helpers for use in external code (e.g., dev-server)
export {
  safeValidateTrackingRequest,
  safeValidateFoxpostTracking,
  validateFoxpostTracking,
  safeValidateFoxpostCredentials,
  validateFoxpostCredentials,
  type FoxpostTracking,
  type FoxpostTrace,
  type FoxpostTrackDTO,
} from './validation.js';
