/**
 * Foxpost Carrier Adapter
 * Implements the CarrierAdapter interface for Foxpost logistics
 */

import type {
  CarrierAdapter,
  Capability,
  CarrierResource,
  AdapterContext,
  CreateParcelRequest,
  CreateParcelsRequest,
  RatesRequest,
} from "@shopickup/core";
import { Capabilities, CarrierError, NotImplementedError } from "@shopickup/core";
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
          { raw: validated.error }
        );
      }

      // Delegate to createParcels when available to reuse batching logic
      if (this.createParcels) {
        const batchReq: CreateParcelsRequest = {
          parcels: [req.parcel],
          credentials: req.credentials,
          options: req.options,
        };
        const results = await this.createParcels(batchReq, ctx);
        return results[0];
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
    */
   async createParcels(
     req: CreateParcelsRequest,
     ctx: AdapterContext
   ): Promise<CarrierResource[]> {
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
         return [];
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
             { raw: { ...carrierValidation.error, parcelIdx: idx } }
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

       const response = await ctx.http.post<any>(
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

       if (!response || !Array.isArray(response.parcels)) {
         throw new CarrierError("Invalid response from Foxpost", "Transient", { raw: response });
       }

       // Map carrier response array -> CarrierResource[]
       const results: CarrierResource[] = response.parcels.map((p: any, idx: number) => {
         const barcode = p?.barcode || p?.barcodeTof || p?.clFoxId;
         if (!barcode) {
           return { carrierId: null as any, status: "failed", raw: p };
         }
         return { carrierId: barcode, status: "created", raw: p };
       });

       ctx.logger?.info("Foxpost: Parcels created", { count: results.length, testMode: useTestApi });

       return results;
     } catch (error) {
       ctx.logger?.error("Foxpost: Error creating parcels batch", {
         error: translateFoxpostError(error),
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
          error: labelError instanceof Error ? labelError.message : String(labelError),
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
        raw: tracks,
      };
    } catch (error) {
      if (error instanceof CarrierError) {
        throw error;
      }
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
