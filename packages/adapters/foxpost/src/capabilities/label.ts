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
   LabelResult,
   LabelFileResource,
} from "@shopickup/core";
import { CarrierError, errorToLog, serializeForLog } from "@shopickup/core";
import { translateFoxpostError } from '../errors.js';
import { safeValidateCreateLabelRequest, safeValidateCreateLabelsRequest, safeValidateFoxpostLabelPdfRaw, safeValidateFoxpostApiError } from "../validation.js";
import { buildFoxpostBinaryHeaders } from '../utils/httpUtils.js';
import type { ResolveBaseUrl } from "../utils/resolveBaseUrl.js";
import { URLSearchParams } from "node:url";
import { randomUUID } from "node:crypto";

/**
 * Create a label (generate PDF) for a single parcel
 * Delegates to createLabels to reuse batching logic
 * 
 * Returns Promise<LabelResult> with file mapping and metadata
 */
export async function createLabel(
  req: CreateLabelRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<LabelResult> {
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
  return results[0];
}

/**
 * Create labels for multiple parcels in one call
 * 
 * Foxpost POST /api/label/{pageSize} endpoint:
 * - Takes array of parcel IDs (barcodes)
 * - Returns PDF with all labels (optionally concatenated based on pageSize)
 * - For A7 size on A4 page, supports startPos parameter (1-7)
 * 
 * Returns structured response with files array and per-item results
 * Foxpost returns one PDF (combined), so all results reference the same file
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
        files: [],
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
    const useTestApi = validated.data.options?.useTestApi ?? false;
    const size = validated.data.options?.size ?? "A7";
    const baseUrl = resolveBaseUrl(validated.data.options);
    const startPos = validated.data.options?.startPos;
    const isPortrait = (validated.data.options as any)?.isPortrait;

    // Construct URL with page size and optional params
    const params = new URLSearchParams();
    if (startPos !== undefined && startPos !== null) params.set('startPos', String(startPos));
    if (isPortrait !== undefined && isPortrait !== null) params.set('isPortrait', String(isPortrait));
    const url = `${baseUrl}/api/label/${size}${params.toString() ? `?${params.toString()}` : ''}`;

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
       const httpResponse = await ctx.http.post<Buffer>(
         url,
         validated.data.parcelCarrierIds,
         {
           headers: buildFoxpostBinaryHeaders(validated.data.credentials),
           responseType: "arraybuffer",
         }
       );

       // Extract buffer from normalized HttpResponse
       const pdfBuffer = httpResponse.body;

       // Validate PDF binary response is non-empty
       const pdfValidation = safeValidateFoxpostLabelPdfRaw(pdfBuffer);
       if (!pdfValidation.success) {
         throw new CarrierError(
           `Invalid PDF response: ${pdfValidation.error.message}`,
           "Transient",
           { raw: serializeForLog(pdfValidation.error) as any }
         );
       }

       // Get byte length (works for Buffer and Uint8Array)
       const byteLength = pdfBuffer instanceof Buffer ? pdfBuffer.byteLength :
         pdfBuffer instanceof Uint8Array ? pdfBuffer.byteLength :
           0;

       // Create file resource for the single PDF
       const fileId = randomUUID();
       const file: LabelFileResource = {
         id: fileId,
         contentType: "application/pdf",
         byteLength,
         pages: req.parcelCarrierIds.length, // One page per label (Foxpost behavior)
         orientation: isPortrait === false ? 'landscape' : 'portrait',
         metadata: {
           size,
           isPortrait,
           barcodeCount: req.parcelCarrierIds.length,
           combined: true, // All labels in one file
         },
       };

       ctx.logger?.info("Foxpost: Labels created successfully", {
         count: req.parcelCarrierIds.length,
         size,
         testMode: useTestApi,
       });

       // Create per-item results, all referencing the same file
       const results: LabelResult[] = req.parcelCarrierIds.map((barcode, idx) => ({
         inputId: barcode,
         status: "created" as const,
         fileId,
         pageRange: { start: idx + 1, end: idx + 1 }, // One page per label
         raw: { barcode, format: "PDF", pageSize: size, startPos, pageNumber: idx + 1 },
       }));

       return {
         results,
         files: [file],
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
       // Try to parse error response as Foxpost ApiError
       let errorMessage = `Failed to generate label: ${(labelError as any)?.message || "Unknown error"}`;
       let errorCategory: 'Validation' | 'Auth' | 'Transient' | 'Permanent' = 'Transient';

       // If labelError is from Foxpost API and contains status/error info, extract it
       if (labelError instanceof CarrierError) {
         // Already a CarrierError from validation, propagate it
         throw labelError;
       }

       // Try to extract HTTP status from axios-like error
       const httpStatus = (labelError as any)?.response?.status;
       if (httpStatus) {
         // Attempt to parse error body as JSON if available
         try {
           const errorBody = (labelError as any)?.response?.data;
           if (errorBody) {
             // Try to parse as Foxpost ApiError
             const apiErrorValidation = safeValidateFoxpostApiError(errorBody);
             if (apiErrorValidation.success) {
               const apiError = apiErrorValidation.data;
               errorMessage = apiError.error || errorMessage;
               // Map HTTP status to error category
               if (httpStatus === 400) {
                 errorCategory = 'Validation';
               } else if (httpStatus === 401 || httpStatus === 403) {
                 errorCategory = 'Auth';
               } else if (httpStatus >= 500) {
                 errorCategory = 'Transient';
               }
             }
           }
         } catch {
           // If parsing fails, use default error category based on status
           if (httpStatus === 400) {
             errorCategory = 'Validation';
           } else if (httpStatus === 401 || httpStatus === 403) {
             errorCategory = 'Auth';
           } else if (httpStatus >= 500) {
             errorCategory = 'Transient';
           }
         }
       }

       // If PDF generation fails, return error results for all barcodes
       ctx.logger?.error("Foxpost: Label generation failed", {
         count: req.parcelCarrierIds.length,
         size,
         error: errorToLog(labelError),
       });

       // Return failed results for all parcels
       const results: LabelResult[] = req.parcelCarrierIds.map((barcode) => ({
         inputId: barcode,
         status: "failed" as const,
         errors: [
           {
             code: "LABEL_GENERATION_FAILED",
             message: errorMessage,
           },
         ],
         raw: { barcode, error: serializeForLog(labelError) },
       }));

       return {
         results,
         files: [],
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
