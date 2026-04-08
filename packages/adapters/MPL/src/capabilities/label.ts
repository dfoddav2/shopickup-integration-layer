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
  CreateLabelResponse,
  CreateLabelsResponse,
  LabelResult,
  LabelFileResource,
} from "@shopickup/core";
import { CarrierError, errorToLog, serializeForLog } from "@shopickup/core";
import type { MPLCredentials, CreateLabelMPLRequest, CreateLabelsMPLRequest } from '../validation.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';
import { safeValidateCreateLabelRequest, safeValidateCreateLabelsRequest, LabelQueryResult } from '../validation.js';
import { buildMPLHeaders } from '../utils/httpUtils.js';
import { buildLabelQueryParams, serializeQueryParams } from '../mappers/label.js';
import { randomUUID } from "node:crypto";

const BLOB_FIELDS = new Set(['label', 'labelBase64']);

function isSerializedBuffer(value: unknown): value is { type: 'Buffer'; data: number[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as any).type === 'Buffer' &&
    Array.isArray((value as any).data)
  );
}

function summarizeBufferLike(value: Buffer | Uint8Array | { type: 'Buffer'; data: number[] }) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return {
      omittedBinary: true,
      byteLength: value.byteLength,
      note: 'binary payload omitted from rawCarrierResponse',
    };
  }

  return {
    omittedBinary: true,
    byteLength: value.data.length,
    note: 'binary payload omitted from rawCarrierResponse',
  };
}

function summarizeArrayBufferLike(value: ArrayBuffer) {
  return {
    omittedBinary: true,
    byteLength: value.byteLength,
    note: 'binary payload omitted from rawCarrierResponse',
  };
}

function sanitizeRawValue(value: unknown, keyHint?: string): unknown {
  if (typeof value === 'string') {
    if (keyHint && BLOB_FIELDS.has(keyHint)) {
      return `[truncated ${keyHint}; length=${value.length}]`;
    }
    return value;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return summarizeBufferLike(value);
  }

  if (value instanceof ArrayBuffer) {
    return summarizeArrayBufferLike(value);
  }

  if (isSerializedBuffer(value)) {
    return summarizeBufferLike(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRawValue(item));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeRawValue(nested, key);
    }
    return out;
  }

  return value;
}

function sanitizeRawCarrierResponse(raw: unknown): unknown {
  return sanitizeRawValue(raw);
}

/**
 * Create a label (generate PDF) for a single parcel
 * Delegates to createLabels to reuse batching logic
 * 
 * Returns Promise<LabelResult> with file mapping and metadata
 */
export async function createLabel(
  req: CreateLabelMPLRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CreateLabelResponse> {
  // Validate single-label request using carrier-specific schema
  const validated = safeValidateCreateLabelRequest(req);
  if (!validated.success) {
    throw new CarrierError(
      `Invalid request: ${validated.error.message}`,
      "Validation",
      { raw: serializeForLog(validated.error) as any }
    );
  }

  // Build batch request from validated single request
  const batchReq: CreateLabelsMPLRequest = {
    parcelCarrierIds: [validated.data.parcelCarrierId],
    credentials: validated.data.credentials,
    options: validated.data.options,
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

  const result = results[0];
  const file = result.fileId
    ? response.files?.find((candidate) => candidate.id === result.fileId)
    : undefined;

  return {
    ...result,
    file,
    rawCarrierResponse: response.rawCarrierResponse,
  };
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
  req: CreateLabelsMPLRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CreateLabelsResponse> {
  try {
    // Validate the incoming request and use parsed data from Zod as the source of truth.
    const validated = safeValidateCreateLabelsRequest({
      parcelCarrierIds: req.parcelCarrierIds,
      credentials: req.credentials,
      options: req.options,
    });

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

    if (!Array.isArray(validated.data.parcelCarrierIds) || validated.data.parcelCarrierIds.length === 0) {
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

    // Build query parameters and resolve base URL based on useTestApi
    const queryParams = buildLabelQueryParams(validated.data);
    const queryString = serializeQueryParams(queryParams);
    const baseUrl = resolveBaseUrl({ useTestApi: validated.data.options.useTestApi });
    const url = `${baseUrl}/shipments/label?${queryString}`;

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
      const accountingCodeFromValidated = validated.data.options?.mpl?.accountingCode;
      const httpResponse = await ctx.http.get<LabelQueryResult[]>(url, {
        headers: buildMPLHeaders(validated.data.credentials, accountingCodeFromValidated),
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
      const fileMap = new Map<string, { file: LabelFileResource; count: number }>();
      const files: LabelFileResource[] = [];
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
            // First occurrence of this label payload: create a stable file resource.
            const buffer = Buffer.from(labelData, 'base64');
            const file: LabelFileResource = {
              id: randomUUID(),
              contentType: queryParams.labelFormat === 'ZPL' ? 'text/plain' : 'application/pdf',
              byteLength: buffer.byteLength,
              pages: 0,
              orientation: 'portrait',
              metadata: {
                labelType: queryParams.labelType,
                labelFormat: queryParams.labelFormat,
                isBase64Encoded: true,
              },
              // Attach raw bytes to the file so callers can access bytes directly
              rawBytes: buffer,
            };
            fileMap.set(labelData, { file, count: 0 });
            files.push(file);
          }

          const entry = fileMap.get(labelData)!;
          entry.count++;
          entry.file.pages = entry.count;
          entry.file.metadata = {
            ...(entry.file.metadata ?? {}),
            combinedLabels: entry.count > 1,
          };

          results.push({
            inputId: trackingNumber,
            status: "created" as const,
            fileId: entry.file.id,
            pageRange: { start: entry.count, end: entry.count },
            raw: { trackingNumber, index: idx },
          });
        }
      });

      ctx.logger?.info("MPL: Labels created", {
        count: req.parcelCarrierIds.length,
        successCount,
        failureCount,
        labelType: queryParams.labelType,
        labelFormat: queryParams.labelFormat,
        testMode: validated.data.options?.useTestApi ?? false,
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
        // Keep response metadata but truncate embedded label/blob payloads.
        rawCarrierResponse: sanitizeRawCarrierResponse(serializeForLog(httpResponse)),
      };
    } catch (labelError) {
      // Handle HTTP errors
      let errorMessage = `Failed to generate label: ${(labelError as any)?.message || "Unknown error"}`;
      let errorCategory: 'Validation' | 'NotFound' | 'Auth' | 'Transient' | 'Permanent' = 'Transient';

      // If labelError is already a CarrierError, propagate it
      if (labelError instanceof CarrierError) {
        throw labelError;
      }

      // Try to extract HTTP status from error
      const httpStatus = (labelError as any)?.response?.status;

      if (httpStatus === 400) {
        errorCategory = /not[_ -]?found/i.test(String((labelError as any)?.response?.data?.error || (labelError as any)?.response?.data?.message || errorMessage))
          ? 'NotFound'
          : 'Validation';
        errorMessage = errorCategory === 'NotFound' ? 'Requested tracking number not found' : "Invalid label request parameters";
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
        rawCarrierResponse: sanitizeRawCarrierResponse({ error: serializeForLog(labelError) }),
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
