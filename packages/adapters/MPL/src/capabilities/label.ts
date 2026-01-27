/**
 * MPL Adapter: Label Generation Capability
 * Handles CREATE_LABEL and CREATE_LABELS operations
 * 
 * Key differences from Foxpost:
 * - Uses GET request instead of POST
 * - Returns JSON array with base64-encoded label data
 * - Multiple query parameters including labelType, labelFormat, orderBy, singleFile
 * - Per-item error handling in the response array
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
import type { MPLCredentials } from '../validation.js';
import { safeValidateCreateLabelsRequest, LabelQueryResult } from '../validation.js';
import { buildMPLHeaders } from '../utils/httpUtils.js';
import { buildLabelQueryParams, serializeQueryParams } from '../mappers/label.js';
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
): Promise<LabelResult> {
  // Convert single label request to batch request with same options
  const batchReq: CreateLabelsRequest = {
    parcelCarrierIds: [req.parcelCarrierId],
    credentials: req.credentials,
    options: req.options,
  };

  // Delegate to batch implementation
  const response = await createLabels(batchReq, ctx);

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
 * MPL GET /shipments/label endpoint:
 * - Takes array of tracking numbers (query params)
 * - Optional labelType, labelFormat, orderBy, singleFile params
 * - Returns JSON array of LabelQueryResult objects with base64-encoded label data
 * - Each result has trackingNumber, label (base64), errors/warnings arrays
 * 
 * Returns structured response with files array and per-item results
 */
export async function createLabels(
  req: CreateLabelsRequest,
  ctx: AdapterContext,
): Promise<CreateLabelsResponse> {
  try {
    // For MPL, we need accountingCode which comes from credentials or options
    // Extract it from credentials if present, or throw error
    const accountingCode = (req.credentials as any)?.accountingCode || 
                          (req.options as any)?.accountingCode;
    if (!accountingCode) {
      throw new CarrierError(
        "accountingCode is required in credentials or options",
        "Validation"
      );
    }

    // Build MPL-specific request with accountingCode for validation
    const mplRequest = {
      parcelCarrierIds: req.parcelCarrierIds,
      credentials: req.credentials as MPLCredentials,
      accountingCode,
      options: req.options,
    };

    // Validate request format and credentials
    const validated = safeValidateCreateLabelsRequest(mplRequest);
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

    // Build query parameters
    const queryParams = buildLabelQueryParams(mplRequest);
    const queryString = serializeQueryParams(queryParams);
    const url = `/v2/mplapi/shipments/label?${queryString}`;

    ctx.logger?.debug("MPL: Creating labels batch", {
      count: req.parcelCarrierIds.length,
      labelType: queryParams.labelType,
      labelFormat: queryParams.labelFormat,
      orderBy: queryParams.orderBy,
      singleFile: queryParams.singleFile,
    });

    try {
      // Make request to MPL label API
      // Response is JSON array of LabelQueryResult
      const httpResponse = await ctx.http.get<LabelQueryResult[]>(url, {
        headers: buildMPLHeaders(validated.data.credentials, validated.data.accountingCode),
      });

      const labelResults = httpResponse.body as unknown as LabelQueryResult[];

      if (!Array.isArray(labelResults)) {
        throw new CarrierError(
          `Invalid response: expected array, got ${typeof labelResults}`,
          "Transient",
          { raw: serializeForLog(labelResults) as any }
        );
      }

      // Process results and build file resources
      const fileMap = new Map<string, { data: string; count: number }>();
      const results: LabelResult[] = [];
      let successCount = 0;
      let failureCount = 0;

      labelResults.forEach((result, idx) => {
        const trackingNumber = result.trackingNumber || req.parcelCarrierIds[idx];

        // Check if this result has errors
        if (result.errors && result.errors.length > 0) {
          // Failed label
          failureCount++;
          results.push({
            inputId: trackingNumber,
            status: "failed" as const,
            errors: result.errors.map(err => ({
              code: err.code,
              message: err.text || err.text_eng || "Unknown error",
            })),
            raw: { ...result, attemptedIndex: idx },
          });
        } else if (!result.label) {
          // No label data returned
          failureCount++;
          results.push({
            inputId: trackingNumber,
            status: "failed" as const,
            errors: [{ code: "NO_LABEL_DATA", message: "No label data in response" }],
            raw: { ...result, attemptedIndex: idx },
          });
        } else {
          // Successful label - decode base64
          successCount++;
          const labelData = result.label;

          // Group labels by content (if singleFile=true, all will be same)
          // Use labelData as key to detect identical responses
          if (!fileMap.has(labelData)) {
            fileMap.set(labelData, { data: labelData, count: 0 });
          }
          const entry = fileMap.get(labelData)!;
          entry.count++;

          // Create file resource if not already created
          let fileId: string;
          if (entry.count === 1) {
            // First occurrence of this label data - create file resource
            fileId = randomUUID();
            
            // Decode base64 to buffer for byte length calculation
            const buffer = Buffer.from(labelData, 'base64');
            const file: LabelFileResource = {
              id: fileId,
              contentType: queryParams.labelFormat === 'ZPL' ? 'text/plain' : 'application/pdf',
              byteLength: buffer.byteLength,
              pages: 1, // Each label is typically one page
              orientation: 'portrait',
              metadata: {
                labelType: queryParams.labelType,
                labelFormat: queryParams.labelFormat,
                trackingNumber,
                isBase64Encoded: true,
              },
            };
            results.push({
              inputId: trackingNumber,
              status: "created" as const,
              fileId,
              pageRange: { start: 1, end: 1 },
              raw: { trackingNumber, index: idx },
            });
          } else {
            // Re-use existing file ID for identical label data
            const existingResult = results.find(r => 
              r.status === 'created' && 
              fileMap.has(labelData) &&
              fileMap.get(labelData)!.data === labelData &&
              r.inputId !== trackingNumber
            );
            fileId = existingResult?.fileId || randomUUID();
            
            results.push({
              inputId: trackingNumber,
              status: "created" as const,
              fileId,
              pageRange: { start: entry.count, end: entry.count },
              raw: { trackingNumber, index: idx },
            });
          }
        }
      });

      // Build files array from unique label data
      const files: LabelFileResource[] = Array.from(fileMap.entries()).map(([labelData, entry]) => {
        const buffer = Buffer.from(labelData, 'base64');
        return {
          id: randomUUID(),
          contentType: queryParams.labelFormat === 'ZPL' ? 'text/plain' : 'application/pdf',
          byteLength: buffer.byteLength,
          pages: entry.count,
          orientation: 'portrait',
          metadata: {
            labelType: queryParams.labelType,
            labelFormat: queryParams.labelFormat,
            combinedLabels: entry.count > 1,
          },
        };
      });

      ctx.logger?.info("MPL: Labels created", {
        count: req.parcelCarrierIds.length,
        successCount,
        failureCount,
        labelType: queryParams.labelType,
        labelFormat: queryParams.labelFormat,
      });

      return {
        results,
        files,
        successCount,
        failureCount,
        totalCount: labelResults.length,
        allSucceeded: failureCount === 0,
        allFailed: successCount === 0,
        someFailed: failureCount > 0 && successCount > 0,
        summary: `${successCount} labels created, ${failureCount} failed`,
        rawCarrierResponse: {
          results: labelResults,
          labelCount: successCount,
          errorCount: failureCount,
        },
      };
    } catch (labelError) {
      // Handle HTTP errors
      let errorMessage = `Failed to generate label: ${(labelError as any)?.message || "Unknown error"}`;
      let errorCategory: 'Validation' | 'Auth' | 'Transient' | 'Permanent' = 'Transient';

      // If labelError is already a CarrierError, propagate it
      if (labelError instanceof CarrierError) {
        throw labelError;
      }

      // Try to extract HTTP status from error
      const httpStatus = (labelError as any)?.response?.status;

      if (httpStatus === 400) {
        errorCategory = 'Validation';
        errorMessage = "Invalid label request parameters";
      } else if (httpStatus === 401 || httpStatus === 403) {
        errorCategory = 'Auth';
        errorMessage = "Authentication failed - invalid credentials or authorization";
      } else if (httpStatus === 429) {
        errorCategory = 'Transient';
        errorMessage = "Rate limit exceeded";
      } else if (httpStatus && httpStatus >= 500) {
        errorCategory = 'Transient';
        errorMessage = "Server error - please retry";
      } else {
        // Network or other error
        errorCategory = 'Transient';
      }

      ctx.logger?.error("MPL: Label generation failed", {
        count: req.parcelCarrierIds.length,
        httpStatus,
        error: errorToLog(labelError),
      });

      // Return failed results for all parcels
      const results: LabelResult[] = req.parcelCarrierIds.map((trackingNumber) => ({
        inputId: trackingNumber,
        status: "failed" as const,
        errors: [{ code: "LABEL_GENERATION_FAILED", message: errorMessage }],
        raw: { trackingNumber, error: serializeForLog(labelError) },
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
    ctx.logger?.error("MPL: Error creating labels", {
      count: req.parcelCarrierIds.length,
      error: errorToLog(error),
    });
    throw new CarrierError(
      `Label creation failed: ${(error as any)?.message || "Unknown error"}`,
      "Transient",
      { raw: serializeForLog(error) as any }
    );
  }
}
