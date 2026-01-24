/**
 * Foxpost Adapter: Parcel Creation Capabilities
 * Handles CREATE_PARCEL and CREATE_PARCELS operations
 */

import type {
  CarrierResource,
  ParcelValidationError,
  AdapterContext,
  CreateParcelRequest,
  CreateParcelsRequest,
  CreateParcelsResponse,
} from "@shopickup/core";
import { CarrierError, serializeForLog, errorToLog } from "@shopickup/core";
import {
  mapParcelToFoxpost,
  mapParcelToFoxpostCarrierType,
} from '../mappers/index.js';
import { translateFoxpostError } from '../errors.js';
import { safeValidateCreateParcelRequest, safeValidateCreateParcelsRequest, safeValidateFoxpostParcel } from '../validation.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';

/**
 * Create a single parcel in Foxpost
 * Delegates to createParcels to reuse batching logic
 */
export async function createParcel(
  req: CreateParcelRequest,
  ctx: AdapterContext,
  createParcelsImpl: (req: CreateParcelsRequest, ctx: AdapterContext) => Promise<CreateParcelsResponse>,
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

  const batchReq: CreateParcelsRequest = {
    parcels: [req.parcel],
    credentials: req.credentials,
    options: req.options,
  };
  const response = await createParcelsImpl(batchReq, ctx);

  // Expect CreateParcelsResponse. Validate shape and return the first result.
  if (!response || !Array.isArray((response as CreateParcelsResponse).results)) {
    // Defensive: unexpected shape from createParcels
    throw new CarrierError(
      "Unexpected response shape from createParcels",
      "Transient",
      { raw: serializeForLog(response) as any }
    );
  }

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

/**
 * Create multiple parcels in one call
 * Maps canonical Parcel array to Foxpost CreateParcelRequest and calls the
 * Foxpost batch endpoint which accepts an array. Returns per-item CarrierResource
 * so callers can handle partial failures.
 * 
 * @returns CreateParcelsResponse with summary and per-item results
 */
export async function createParcels(
  req: CreateParcelsRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
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
    const baseUrl = resolveBaseUrl(validated.data.options);
    const useTestApi = validated.data.options?.useTestApi ?? false;
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

    // Extract strongly-typed credentials from validated request
    const { apiKey, basicUsername, basicPassword } = validated.data.credentials;

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
    const carrierRespBody =
      (httpResponse && Array.isArray(httpResponse.parcels)) ? httpResponse :
        (httpResponse && httpResponse.body && Array.isArray(httpResponse.body.parcels)) ? httpResponse.body :
          (httpResponse && httpResponse.data && Array.isArray(httpResponse.data.parcels)) ? httpResponse.data :
            null;

    if (!carrierRespBody || !Array.isArray(carrierRespBody.parcels)) {
      throw new CarrierError("Invalid response from Foxpost", "Transient", { raw: serializeForLog(httpResponse) as any });
    }

    const response = carrierRespBody;

    // Check if response indicates an overall validation failure
    if (response.valid === false && response.errors && Array.isArray(response.errors)) {
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
    const results: CarrierResource[] = response.parcels.map((p: any, idx: number) => {
      // Check for parcel-level validation errors
      if (p.errors && Array.isArray(p.errors) && p.errors.length > 0) {
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

        const rawParcel = serializeForLog(p) as any;
        rawParcel.errors = errors;

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
        ctx.logger?.warn("Foxpost: Parcel created returned no clFoxId", {
          parcelIdx: idx,
          refCode: p.refCode,
        });

        return {
          carrierId: null as any,
          status: "failed",
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
