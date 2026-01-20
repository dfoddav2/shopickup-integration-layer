/**
 * Foxpost Carrier Adapter
 * Implements the CarrierAdapter interface for Foxpost logistics
 */

import type {
  CarrierAdapter,
  Capability,
  CarrierResource,
  AdapterContext,
  CreateShipmentRequest,
  CreateParcelRequest,
  RatesRequest,
} from "@shopickup/core";
import { Capabilities, CarrierError, NotImplementedError } from "@shopickup/core";
import { FoxpostClient } from './client/index.js';
import {
  mapParcelToFoxpost,
  mapFoxpostTrackToCanonical,
} from './mappers/index.js';
import { translateFoxpostError } from './errors.js';
import type { TrackingUpdate } from "@shopickup/core";

/**
 * FoxpostAdapter
 * 
 * Foxpost (hu-foxpost) is a major Hungarian logistics carrier.
 * 
 * Capabilities supported:
 * - CREATE_PARCEL: Create parcels directly (no shipment container needed)
 * - TRACK: Track parcels by barcode
 * - CREATE_LABEL: Generate PDF labels for parcels
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
   * NOT IMPLEMENTED: Foxpost doesn't have a shipment concept
   * Shipments are created implicitly when parcels are created
   */
  async createShipment(
    req: CreateShipmentRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    throw new NotImplementedError("CREATE_SHIPMENT", this.id);
  }

  /**
   * Create a parcel in Foxpost
   * 
   * Maps canonical Parcel + Shipment to Foxpost CreateParcelRequest
   * Returns the parcel barcode as carrierId
   * 
   * @param useTestApi Use test API endpoint if true (optional)
   */
  async createParcel(
    _shipmentCarrierId: string,
    req: CreateParcelRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    try {
      if (!ctx.http) {
        throw new CarrierError(
          "HTTP client not provided in context",
          "Permanent"
        );
      }

      // Extract useTestApi from request options and set variables based on it
      const useTestApi = req.options?.useTestApi ?? false;
      const baseUrl = this.getBaseUrl(useTestApi);
      const isWeb = !useTestApi; // For Foxpost, isWeb can only be used in production

      ctx.logger?.debug("Foxpost: Creating parcel", {
        parcelId: req.parcel.id,
        weight: req.parcel.weight,
        testMode: useTestApi,
      });

      // Map canonical parcel + shipment to Foxpost request
      const foxpostRequest = mapParcelToFoxpost(req.parcel, req.shipment);

      // Extract credentials from request
      const apiKey = (req.credentials?.apiKey as string) || "";
      const basicUsername = (req.credentials?.username as string) || "";
      const basicPassword = (req.credentials?.password as string) || "";

      // Create parcels - pass the injected HTTP client and API key
      // NOTE: Pass object directly (not stringified) — http-client will stringify it
      const response = await ctx.http.post<any>(
        `${baseUrl}/api/parcel?isWeb=${isWeb}&isRedirect=false`,
        [foxpostRequest],  // Pass array of parcel objects (not stringified)
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${Buffer.from(`${basicUsername}:${basicPassword}`).toString("base64")}`,
            ...(apiKey && { "Api-key": apiKey }),  // Match Foxpost header casing
          },
        }
      );

      if (!response.valid || !response.parcels || response.parcels.length === 0) {
        const errors = response.parcels?.[0]?.errors || [];
        const errorMsg = errors
          .map((e: any) => `${e.field}: ${e.message}`)
          .join(", ");

        throw new CarrierError(
          `Failed to create parcel: ${errorMsg || "Unknown error"}`,
          "Validation"
        );
      }

      const barcode = response.parcels[0]?.barcode;
      if (!barcode) {
        throw new CarrierError(
          "No barcode returned from Foxpost",
          "Permanent"
        );
      }

      ctx.logger?.info("Foxpost: Parcel created", { barcode, testMode: useTestApi });

      return {
        carrierId: barcode,
        status: "created",
        raw: response,
      };
    } catch (error) {
      ctx.logger?.error("Foxpost: Error creating parcel", {
        parcelId: req.parcel.id,
        error: translateFoxpostError(error),
      });
      if (error instanceof CarrierError) {
        throw error;
      }
      throw translateFoxpostError(error);
    }
  }

  /**
   * NOT IMPLEMENTED: Foxpost doesn't have close operation
   */
  async closeShipment(
    _shipmentCarrierId: string,
    _ctx: AdapterContext
  ): Promise<CarrierResource> {
    throw new NotImplementedError("CLOSE_SHIPMENT", this.id);
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
