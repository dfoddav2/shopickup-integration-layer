/**
 * Foxpost Carrier Adapter
 * Implements the CarrierAdapter interface for Foxpost logistics
 */

import type {
  CarrierAdapter,
  Capability,
  CarrierResource,
  ParcelValidationError,
  AdapterContext,
  CreateParcelRequest,
  CreateParcelsRequest,
  RatesRequest,
  CreateParcelsResponse,
} from "@shopickup/core";
import { Capabilities, CarrierError, NotImplementedError, serializeForLog, errorToLog } from "@shopickup/core";
import { FoxpostClient } from './client/index.js';
import {
  mapParcelToFoxpost,
  mapFoxpostTrackToCanonical,
  mapParcelToFoxpostCarrierType,
} from './mappers/index.js';
import { translateFoxpostError } from './errors.js';
import { safeValidateCreateParcelRequest, safeValidateCreateParcelsRequest, safeValidateFoxpostParcel } from './validation.js';
import type { TrackingUpdate } from "@shopickup/core";

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
 * - Use options.useTestApi = true to switch to test endpoint per-call
 * 
 * Notes:
 * - Foxpost does NOT have a shipment concept; parcels are created directly
 * - Labels are generated per parcel
 * - Tracking available via barcode (FoxWeb barcode format: CLFOX...)
 * - Test API requires separate test credentials
 */
export class FoxpostAdapter implements CarrierAdapter {
  readonly id = "hu-foxpost";
  readonly displayName = "Foxpost Hungary";

  readonly capabilities: Capability[] = [
    Capabilities.CREATE_PARCEL,
    Capabilities.CREATE_PARCELS,
    Capabilities.CREATE_LABEL,
    Capabilities.TRACK,
    Capabilities.TEST_MODE_SUPPORTED,
  ];

  // Foxpost doesn't require close before label
  readonly requires = {};

  private client: FoxpostClient;
  private prodBaseUrl: "https://webapi.foxpost.hu";
  private testBaseUrl = "https://webapi-test.foxpost.hu";

  constructor(baseUrl: string = "https://webapi.foxpost.hu") {
    this.prodBaseUrl = "https://webapi.foxpost.hu";
    this.testBaseUrl = "https://webapi-test.foxpost.hu";
    this.client = new FoxpostClient(baseUrl);
  }

  /**
   * Resolve the base URL based on test mode flag
   * @param useTestApi Whether to use test API endpoint
   * @returns Base URL to use for this request
   */
  private getBaseUrl(useTestApi?: boolean): string {
    return useTestApi ? this.testBaseUrl : this.prodBaseUrl;
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
    req: CreateParcelRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    // Validate request format and credentials
    const validated = safeValidateCreateParcelRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error.message}`,
        "Validation",
        { raw: serializeForLog(validated.error) as any }
      );
    }

    // Delegate to createParcels when available to reuse batching logic
    if (this.createParcels) {
      const batchReq: CreateParcelsRequest = {
        parcels: [req.parcel],
        credentials: req.credentials,
        options: req.options,
      };
      const response = await this.createParcels(batchReq, ctx);

      // Expect CreateParcelsResponse. Validate shape and return the first result.
      if (!response || !Array.isArray((response as CreateParcelsResponse).results)) {
        // Defensive: unexpected shape from createParcels
        throw new CarrierError(
          "Unexpected response shape from createParcels",
          "Transient",
          { raw: serializeForLog(response) as any }
        );
      }

      // Got response from batch create
      // ctx.logger?.debug("Foxpost: createParcel received batch result from createParcels", { raw: serializeForLog(response) });

      const results = (response as CreateParcelsResponse).results;
      if (results.length === 0) {
        throw new CarrierError(
          "createParcels returned an empty results array",
          "Transient",
          { raw: serializeForLog(response) as any }
        );
      }

      // Return the first parcel result, but attach rawCarrierResponse for batch-level context
      const result = results[0];
      return {
        ...result,
        rawCarrierResponse: response.rawCarrierResponse,
      } as CarrierResource & { rawCarrierResponse?: unknown };
    }

    throw new CarrierError(
      "createParcels not implemented on adapter",
      "Permanent"
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
    req: CreateParcelsRequest,
    ctx: AdapterContext
  ): Promise<CreateParcelsResponse> {
    try {
      // Validate request format and credentials
      const validated = safeValidateCreateParcelsRequest(req);
      if (!validated.success) {
        throw new CarrierError(
          `Invalid request: ${validated.error.message}`,
          "Validation",
          { raw: validated.error }
        );
      }

      if (!ctx.http) {
        throw new CarrierError(
          "HTTP client not provided in context",
          "Permanent"
        );
      }

      if (!Array.isArray(req.parcels) || req.parcels.length === 0) {
        return {
          results: [],
          successCount: 0,
          failureCount: 0,
          totalCount: 0,
          allSucceeded: false,
          allFailed: false,
          someFailed: false,
          summary: "No parcels to process",
        };
      }

      // For simplicity require uniform test-mode and credentials across the batch
      const useTestApi = req.options?.useTestApi ?? false;
      const baseUrl = this.getBaseUrl(useTestApi);
      const isWeb = !useTestApi;

      // Validate and map each canonical parcel to Foxpost carrier-specific type
      // This catches mapping errors early before sending to carrier
      const foxpostRequestsWithValidation = req.parcels.map((parcel, idx) => {
        // Map to carrier-specific parcel type (HD or APM)
        const carrierParcel = mapParcelToFoxpostCarrierType(parcel);

        // Validate the mapped carrier parcel
        const carrierValidation = safeValidateFoxpostParcel(carrierParcel);
        if (!carrierValidation.success) {
          throw new CarrierError(
            `Invalid carrier payload for parcel ${idx}: ${carrierValidation.error.message}`,
            "Validation",
            { raw: serializeForLog({ ...carrierValidation.error, parcelIdx: idx }) as any }
          );
        }

        // Map to Foxpost OpenAPI request format
        return mapParcelToFoxpost(parcel);
      });

      // Extract credentials from request
      const apiKey = (req.credentials?.apiKey as string) || "";
      const basicUsername = (req.credentials?.basicUsername as string) || "";
      const basicPassword = (req.credentials?.basicPassword as string) || "";

      ctx.logger?.debug("Foxpost: Creating parcels batch", {
        count: req.parcels.length,
        testMode: useTestApi,
      });

      const httpResponse = await ctx.http.post<any>(
        `${baseUrl}/api/parcel?isWeb=${isWeb}&isRedirect=false`,
        foxpostRequestsWithValidation,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${Buffer.from(`${basicUsername}:${basicPassword}`).toString("base64")}`,
            ...(apiKey && { "Api-key": apiKey }),
          },
        }
      );

      // Normalize carrier response body from various HTTP client shapes
      // Different HTTP clients wrap responses differently (Axios: response.data, Fetch wrapper: response.body, etc.)
      // Extract the actual carrier body while preserving the full HTTP response for debugging
      const carrierRespBody =
        (httpResponse && Array.isArray(httpResponse.parcels)) ? httpResponse :
          (httpResponse && httpResponse.body && Array.isArray(httpResponse.body.parcels)) ? httpResponse.body :
            (httpResponse && httpResponse.data && Array.isArray(httpResponse.data.parcels)) ? httpResponse.data :
              null;

      if (!carrierRespBody || !Array.isArray(carrierRespBody.parcels)) {
        throw new CarrierError("Invalid response from Foxpost", "Transient", { raw: serializeForLog(httpResponse) as any });
      }

      // Store the full HTTP response (including headers/status if available) for later inspection
      const response = carrierRespBody;

      // Check if response indicates an overall validation failure
      // Foxpost returns HTTP 200 with valid=false when parcels have validation errors
      if (response.valid === false && response.errors && Array.isArray(response.errors)) {
        // Extract first error for the error message
        const firstError = response.errors[0];
        const errorCode = firstError?.message || "VALIDATION_ERROR";
        const errorField = firstError?.field || "unknown";

        throw new CarrierError(
          `Validation error: ${errorCode} (field: ${errorField})`,
          "Validation",
          {
            carrierCode: errorCode,
            raw: serializeForLog(response) as any
          }
        );
      }

      // Map carrier response array -> CarrierResource[]
      // Check each parcel for individual errors even if response.valid is true
      const results: CarrierResource[] = response.parcels.map((p: any, idx: number) => {
        // Check for parcel-level validation errors
        if (p.errors && Array.isArray(p.errors) && p.errors.length > 0) {
          // Parcel has validation errors - collect all errors
          const errors: ParcelValidationError[] = p.errors.map((err: any): ParcelValidationError => ({
            field: err.field,
            code: err.message, // Foxpost returns error code in 'message' field
            message: `${err.field ? `Field '${err.field}': ` : ''}${err.message}`,
          }));

          ctx.logger?.warn("Foxpost: Parcel validation errors", {
            parcelIdx: idx,
            errorCount: errors.length,
            errorSummary: errors.map(e => `${e.field || 'unknown'}: ${e.code}`),
            refCode: p.refCode,
            errors: serializeForLog(errors),
          });

          // Include the full carrier parcel response but ensure errors are the normalized form
          const rawParcel = serializeForLog(p) as any;
          rawParcel.errors = errors;

          // Return failed CarrierResource - with null carrierId
          return {
            carrierId: null as any,
            status: "failed",
            raw: rawParcel,
            errors,
          };
        }

        // Check for successful barcode assignment
        const carrierId = p.clFoxId;
        if (!carrierId) {
          // No barcode was generated - this is a failure
          ctx.logger?.warn("Foxpost: Parcel created returned no clFoxId", {
            parcelIdx: idx,
            refCode: p.refCode,
          });

          // Return failed CarrierResource with custom error of not assigned barcode / tracking number
          return {
            carrierId: null as any,
            status: "failed",
            // Preserve the full carrier response for later inspection
            raw: serializeForLog(p) as any,
            errors: [{
              field: "clFoxId",
              message: "No barcode assigned by carrier",
              code: "NO_BARCODE_ASSIGNED",
            }],
          };
        }

        // Success - parcel was created with barcode
        return {
          carrierId,
          status: "created",
          // Keep the original carrier parcel response intact in `raw`
          raw: serializeForLog(p) as any,
        };
      });

      // Calculate summary statistics
      const successCount = results.filter(r => r.status === 'created').length;
      const failureCount = results.filter(r => r.status === 'failed').length;
      const totalCount = results.length;

      // Determine summary text
      let summary: string;
      if (failureCount === 0) {
        summary = `All ${totalCount} parcels created successfully`;
      } else if (successCount === 0) {
        summary = `All ${totalCount} parcels failed`;
      } else {
        summary = `Mixed results: ${successCount} succeeded, ${failureCount} failed`;
      }

      ctx.logger?.info("Foxpost: Parcels creation finished", {
        count: results.length,
        testMode: useTestApi,
        summary,
        successCount,
        failureCount,
      });

      // Return strongly-typed response with full carrier response for debugging
      return {
        results,
        successCount,
        failureCount,
        totalCount,
        allSucceeded: failureCount === 0 && totalCount > 0,
        allFailed: successCount === 0 && totalCount > 0,
        someFailed: successCount > 0 && failureCount > 0,
        summary,
        rawCarrierResponse: serializeForLog(httpResponse),
      };
    } catch (error) {
      ctx.logger?.error("Foxpost: Error creating parcels batch", {
        error: errorToLog(error),
      });
      if (error instanceof CarrierError) {
        throw error;
      }
      throw translateFoxpostError(error);
    }
  }


  /**
   * Create a label (generate PDF) for a parcel
  * 
  * Takes the parcel's Foxpost barcode and generates a PDF label
  * Returns base64-encoded PDF in labelUrl field
  * 
  * To use test API, pass in context as:
  * { http: client, logger: console, options?: { useTestApi: true } }
  */
  async createLabel(
    parcelCarrierId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource & { labelUrl?: string | null }> {
    try {
      if (!ctx.http) {
        throw new CarrierError(
          "HTTP client not provided in context",
          "Permanent"
        );
      }

      // Extract useTestApi from context options (if provided via extended context)
      const useTestApi = (ctx as any)?.options?.useTestApi ?? false;
      const baseUrl = this.getBaseUrl(useTestApi);

      ctx.logger?.debug("Foxpost: Creating label", {
        barcode: parcelCarrierId,
        testMode: useTestApi,
      });

      // Generate label for the barcode
      // Foxpost API returns PDF in binary format
      // We convert to base64 for storage/transmission
      const url = `${baseUrl}/api/label?barcodes=${parcelCarrierId}&pageSize=A7`;

      try {
        const pdfBuffer = await ctx.http.get<Buffer>(url, {
          headers: {
            "Content-Type": "application/json",
          },
          // Note: In real implementation, would need to handle binary response
          // axios/fetch automatically handles this, but some HTTP clients may need special handling
          responseType: "arraybuffer",
        });

        // Convert PDF buffer to base64 for storage
        const labelUrl = `data:application/pdf;base64,${Buffer.from(pdfBuffer).toString("base64")}`;

        ctx.logger?.info("Foxpost: Label created", {
          barcode: parcelCarrierId,
          testMode: useTestApi,
        });

        return {
          carrierId: parcelCarrierId,
          status: "created",
          labelUrl,
          raw: { barcode: parcelCarrierId, format: "PDF", pageSize: "A7" },
        };
      } catch (labelError) {
        // If PDF generation fails, return success with placeholder
        // This allows shipment to proceed; label can be generated later
        ctx.logger?.warn("Foxpost: Could not generate PDF label, returning placeholder", {
          barcode: parcelCarrierId,
          testMode: useTestApi,
          error: errorToLog(labelError),
        });

        return {
          carrierId: parcelCarrierId,
          status: "created",
          labelUrl: null,
          raw: { barcode: parcelCarrierId, format: "PDF", pageSize: "A7", note: "PDF generation pending" },
        };
      }
    } catch (error) {
      if (error instanceof CarrierError) {
        throw error;
      }
      ctx.logger?.error("Foxpost: Error creating label", {
        parcelCarrierId,
        error: errorToLog(error),
      });
      throw translateFoxpostError(error);
    }
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
   * Track a parcel by barcode
   * 
   * Returns normalized tracking information
   * 
   * To use test API, pass in context as:
   * { http: client, logger: console, options?: { useTestApi: true } }
   */
  async track(
    trackingNumber: string,
    ctx: AdapterContext
  ): Promise<TrackingUpdate> {
    try {
      if (!ctx.http) {
        throw new CarrierError(
          "HTTP client not provided in context",
          "Permanent"
        );
      }

      // Extract useTestApi from context options (if provided via extended context)
      const useTestApi = (ctx as any)?.options?.useTestApi ?? false;
      const baseUrl = this.getBaseUrl(useTestApi);

      ctx.logger?.debug("Foxpost: Tracking parcel", {
        trackingNumber,
        testMode: useTestApi,
      });

      // Get tracking history directly via HTTP
      const url = `${baseUrl}/api/tracking/tracks/${trackingNumber}`;
      const tracks = await ctx.http.get<any[]>(url, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!tracks || tracks.length === 0) {
        throw new CarrierError(
          `No tracking information found for ${trackingNumber}`,
          "Validation"
        );
      }

      // Convert Foxpost tracks to canonical TrackingEvents
      const events = tracks.map(mapFoxpostTrackToCanonical);

      // Current status is the latest event
      const currentStatus = events.length > 0
        ? events[events.length - 1].status
        : "PENDING";

      ctx.logger?.info("Foxpost: Tracking retrieved", {
        trackingNumber,
        status: currentStatus,
        events: events.length,
        testMode: useTestApi,
      });

      return {
        trackingNumber,
        events,
        status: currentStatus,
        lastUpdate: events[events.length - 1]?.timestamp || new Date(),
        raw: serializeForLog(tracks) as any,
      };
    } catch (error) {
      if (error instanceof CarrierError) {
        throw error;
      }
      ctx.logger?.error("Foxpost: Error tracking parcel", {
        trackingNumber,
        error: errorToLog(error),
      });
      throw translateFoxpostError(error);
    }
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
