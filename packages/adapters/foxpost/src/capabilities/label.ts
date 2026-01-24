/**
 * Foxpost Adapter: Label Generation Capability
 * Handles CREATE_LABEL and CREATE_LABELS operations
 */

import type {
  CarrierResource,
  AdapterContext,
  CreateLabelRequest,
  CreateLabelsRequest,
  CreateLabelsResponse,
} from "@shopickup/core";
import { CarrierError, errorToLog, serializeForLog } from "@shopickup/core";
import { translateFoxpostError } from '../errors.js';
import { safeValidateCreateLabelRequest, safeValidateCreateLabelsRequest } from "../validation.js";
import type { ResolveBaseUrl } from "../utils/resolveBaseUrl.js";
import { URLSearchParams } from "node:url";

/**
 * Create a label (generate PDF) for a single parcel
 * Delegates to createLabels to reuse batching logic
 */
export async function createLabel(
  req: CreateLabelRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CarrierResource & { labelUrl?: string | null }> {
  // Validate request format and credentials
  const validated = safeValidateCreateLabelRequest(req);
  if (!validated.success) {
    throw new CarrierError(
      `Invalid request: ${validated.error.message}`,
      "Validation",
      { raw: serializeForLog(validated.error) as any }
    );
  }

  // Convert single label request to batch request
  const batchReq: CreateLabelsRequest = {
    parcelCarrierIds: [validated.data.parcelCarrierId],
    credentials: req.credentials,
    options: req.options,
  };

  // Delegate to batch implementation
  const response = await createLabels(batchReq, ctx, resolveBaseUrl);

  // Extract first (only) result
  if (!response || !Array.isArray(response.results)) {
    throw new CarrierError(
      "Unexpected response shape from createLabels",
      "Transient",
      { raw: serializeForLog(response) as any }
    );
  }

  const results = response.results;
  if (results.length === 0) {
    throw new CarrierError(
      "createLabels returned an empty results array",
      "Transient",
      { raw: serializeForLog(response) as any }
    );
  }

  // Return the first (only) label result
  const result = results[0];
  return {
    ...result,
    rawCarrierResponse: response.rawCarrierResponse,
  } as CarrierResource & { labelUrl?: string | null };
}

/**
 * Create labels for multiple parcels in one call
 * 
 * Foxpost POST /api/label/{pageSize} endpoint:
 * - Takes array of parcel IDs (barcodes)
 * - Returns PDF with all labels (optionally concatenated based on pageSize)
 * - For A7 size on A4 page, supports startPos parameter (1-7)
 * 
 * Returns per-item results so callers can track which labels succeeded/failed
 */
export async function createLabels(
  req: CreateLabelsRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CreateLabelsResponse> {
  try {
    // Validate request format and credentials
    const validated = safeValidateCreateLabelsRequest(req);
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

    if (!Array.isArray(req.parcelCarrierIds) || req.parcelCarrierIds.length === 0) {
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

    // Unwrap variables from validated request
    const { apiKey, basicUsername, basicPassword } = validated.data.credentials;
    const useTestApi = validated.data.options?.useTestApi ?? false;
    const size = validated.data.options?.size ?? "A7";
    const baseUrl = resolveBaseUrl(validated.data.options);
    const startPos = validated.data.options?.startPos;
    const isPortrait = validated.data.options?.isPortrait;

    // Construct URL with page size and optional params
    const params = new URLSearchParams();
    if (startPos !== undefined && startPos !== null) params.set('startPos', String(startPos));
    if (isPortrait !== undefined && isPortrait !== null) params.set('isPortrait', String(isPortrait));
    let url = `${baseUrl}/api/label/${size}${params.toString() ? `?${params.toString()}` : ''}`;

    ctx.logger?.debug("Foxpost: Creating labels batch", {
      testMode: useTestApi,
      count: req.parcelCarrierIds.length,
      size,
      startPos,
      isPortrait,
    });

    try {
      // Make request to Foxpost label API
      // Response is PDF binary data
      const pdfBuffer = await ctx.http.post<Buffer>(
        url,
        validated.data.parcelCarrierIds,
        {
          headers: {
            "Accept-Type": "application/pdf",
            // "Content-Type": "application/json",
            "Authorization": `Basic ${Buffer.from(`${basicUsername}:${basicPassword}`).toString("base64")}`,
            ...(apiKey && { "Api-key": apiKey }),
          },
          responseType: "arraybuffer",
        }
      );

      if (!pdfBuffer || pdfBuffer.byteLength === 0) {
        throw new CarrierError(
          "Empty PDF response from Foxpost label endpoint",
          "Transient"
        );
      }

      // Convert PDF buffer to base64
      const labelData = `data:application/pdf;base64,${Buffer.from(pdfBuffer).toString("base64")}`;
      ctx.logger?.info("Foxpost: Labels created successfully", {
        count: req.parcelCarrierIds.length,
        size,
        testMode: useTestApi,
      });

      // Return per-item results
      // All labels in the batch succeeded (Foxpost returns one PDF for all)
      const results = req.parcelCarrierIds.map((barcode) => ({
        carrierId: barcode,
        status: "created" as const,
        labelUrl: labelData,
        raw: { barcode, format: "PDF", pageSize: size, startPos, combined: true },
      }));

      return {
        results,
        successCount: results.length,
        failureCount: 0,
        totalCount: results.length,
        allSucceeded: true,
        allFailed: false,
        someFailed: false,
        summary: `All ${results.length} labels generated successfully`,
        rawCarrierResponse: { pdfBuffer, size, barcodesCount: req.parcelCarrierIds.length },
      };
    } catch (labelError) {
      // If PDF generation fails, return error results for all barcodes
      ctx.logger?.error("Foxpost: Label generation failed", {
        count: req.parcelCarrierIds.length,
        size,
        error: errorToLog(labelError),
      });

      // Return failed results for all parcels
      const results = req.parcelCarrierIds.map((barcode) => ({
        carrierId: barcode,
        status: "failed" as const,
        errors: [
          {
            code: "LABEL_GENERATION_FAILED",
            message: `Failed to generate label: ${(labelError as any)?.message || "Unknown error"}`,
          },
        ],
        raw: { barcode, error: serializeForLog(labelError) },
      }));

      return {
        results,
        successCount: 0,
        failureCount: results.length,
        totalCount: results.length,
        allSucceeded: false,
        allFailed: true,
        someFailed: false,
        summary: `All ${results.length} labels failed`,
        rawCarrierResponse: { error: serializeForLog(labelError) },
      };
    }
  } catch (error) {
    if (error instanceof CarrierError) {
      throw error;
    }
    ctx.logger?.error("Foxpost: Error creating labels", {
      count: req.parcelCarrierIds.length,
      error: errorToLog(error),
    });
    throw translateFoxpostError(error);
  }
}
