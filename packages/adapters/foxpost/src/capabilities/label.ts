/**
 * Foxpost Adapter: Label Generation Capability
 * Handles CREATE_LABEL operation
 */

import type {
  CarrierResource,
  AdapterContext,
  CreateLabelRequest,
} from "@shopickup/core";
import { CarrierError, errorToLog, serializeForLog } from "@shopickup/core";
import { translateFoxpostError } from '../errors.js';
import { safeValidateCreateLabelRequest } from "../validation.js";
import { ResolveBaseUrl } from "../utils/resolveBaseUrl.js";

/**
 * Create a label (generate PDF) for a parcel
 * 
 * @param req CreateLabelRequest with parcelCarrierId (Foxpost barcode)
 * @param ctx AdapterContext with HTTP client and logger
 * @returns CarrierResource with base64-encoded PDF in labelUrl field
 */
export async function createLabel(
  req: CreateLabelRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CarrierResource & { labelUrl?: string | null }> {
  try {
    // Validate request format and credentials
    const validated = safeValidateCreateLabelRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error.message}`,
        "Validation",
        { raw: serializeForLog(validated.error) as any }
      );
    }

    if (!ctx.http) {
      throw new CarrierError(
        "HTTP client not provided in context",
        "Permanent"
      );
    }

    // Extract useTestApi from validated request (per-call test mode selection)
    const useTestApi = validated.data.options?.useTestApi ?? false;
    const baseUrl = resolveBaseUrl(validated.data.options);

    ctx.logger?.debug("Foxpost: Creating label", {
      parcelCarrierId: validated.data.parcelCarrierId,
      endpoint: useTestApi ? "test" : "production",
    });

    // Generate label for the barcode
    // Foxpost API returns PDF in binary format
    // We convert to base64 for storage/transmission
    const url = `${baseUrl}/api/label?barcodes=${validated.data.parcelCarrierId}&pageSize=A7`;

    try {
      const pdfBuffer = await ctx.http.get<Buffer>(url, {
        headers: {
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      });

      // Convert PDF buffer to base64 for storage
      const labelUrl = `data:application/pdf;base64,${Buffer.from(pdfBuffer).toString("base64")}`;

      ctx.logger?.info("Foxpost: Label created", {
        barcode: validated.data.parcelCarrierId,
        endpoint: useTestApi ? "test" : "production",
      });

      return {
        carrierId: validated.data.parcelCarrierId,
        status: "created",
        labelUrl,
        raw: { barcode: validated.data.parcelCarrierId, format: "PDF", pageSize: "A7" },
      };
    } catch (labelError) {
      // If PDF generation fails, return success with placeholder
      // This allows shipment to proceed; label can be generated later
      ctx.logger?.warn("Foxpost: Could not generate PDF label, returning placeholder", {
        barcode: validated.data.parcelCarrierId,
        endpoint: useTestApi ? "test" : "production",
        error: errorToLog(labelError),
      });

      return {
        carrierId: validated.data.parcelCarrierId,
        status: "created",
        labelUrl: null,
        raw: { barcode: validated.data.parcelCarrierId, format: "PDF", pageSize: "A7", note: "PDF generation pending" },
      };
    }
  } catch (error) {
    if (error instanceof CarrierError) {
      throw error;
    }
    ctx.logger?.error("Foxpost: Error creating label", {
      parcelCarrierId: req.parcelCarrierId,
      error: errorToLog(error),
    });
    throw translateFoxpostError(error);
  }
}
