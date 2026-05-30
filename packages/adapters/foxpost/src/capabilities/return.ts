/**
 * Foxpost Adapter: Create Return Capability
 * Handles CREATE_RETURN and CREATE_RETURNS operations
 * 
 * Foxpost endpoints:
 *   POST /api/re/ext    (single return)
 *   POST /api/re/exts   (batch returns)
 */

import type {
  AdapterContext,
  CarrierResource,
  FailedCarrierResource,
  CreateParcelsResponse,
  CreateReturnRequest,
  CreateReturnsRequest,
} from "@shopickup/core";
import { CarrierError, errorToLog, serializeForLog } from "@shopickup/core";
import { translateFoxpostError, sanitizeResponseForLog } from '../errors.js';
import { buildFoxpostHeaders } from '../utils/httpUtils.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';
import {
  safeValidateCreateReturnRequest,
  safeValidateCreateReturnsRequest,
  safeValidateFoxpostApiError,
  type FoxpostCreateReturnOptions,
} from '../validation.js';

/**
 * Create a single return parcel.
 * Delegates to createReturns to reuse batching logic.
 */
export async function createReturn(
  req: CreateReturnRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CarrierResource> {
  const validated = safeValidateCreateReturnRequest(req);
  if (!validated.success) {
    throw new CarrierError(
      `Invalid request: ${validated.error.message}`,
      "Validation",
      { raw: serializeForLog(validated.error) as any }
    );
  }

  const batchReq: CreateReturnsRequest = {
    returns: [validated.data.return],
    credentials: validated.data.credentials,
    options: validated.data.options,
  };

  const response = await createReturns(batchReq, ctx, resolveBaseUrl);

  if (!response || !Array.isArray(response.results) || response.results.length === 0) {
    throw new CarrierError(
      "Unexpected response shape from createReturns",
      "Transient",
      { raw: serializeForLog(response) as any }
    );
  }

  const result = response.results[0];
  return {
    ...result,
    rawCarrierResponse: response.rawCarrierResponse,
  } as CarrierResource & { rawCarrierResponse?: unknown };
}

/**
 * Create multiple return parcels in one call.
 * 
 * Maps canonical ReturnItem array to Foxpost CreateReParcelReq and calls the
 * batch endpoint. Returns per-item results with summary statistics.
 */
export async function createReturns(
  req: CreateReturnsRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CreateParcelsResponse> {
  try {
    const validated = safeValidateCreateReturnsRequest(req);
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

    if (!Array.isArray(req.returns) || req.returns.length === 0) {
      return {
        results: [],
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        allSucceeded: false,
        allFailed: false,
        someFailed: false,
        summary: "No returns to process",
      };
    }

    const useTestApi = validated.data.options?.useTestApi ?? false;
    const baseUrl = resolveBaseUrl({ useTestApi });
    const returnType = (validated.data.options as FoxpostCreateReturnOptions | undefined)?.foxpost?.returnType ?? 'RE';

    // Map canonical return items to Foxpost format
    const foxpostRequests = req.returns.map((ret) => ({
      barcode: ret.parcelCarrierId,
      uniqueBarcode: ret.uniqueBarcode,
      refCode: ret.refCode,
    }));

    ctx.logger?.debug("Foxpost: Creating returns batch", {
      count: req.returns.length,
      testMode: useTestApi,
      returnType,
    });

    const httpResponse = await ctx.http.post(
      `${baseUrl}/api/re/exts?returnType=${returnType}`,
      foxpostRequests,
      {
        headers: buildFoxpostHeaders(validated.data.credentials as any),
      }
    );

    const carrierRespBody = httpResponse.body;

    if (!carrierRespBody || !Array.isArray(carrierRespBody)) {
      throw new CarrierError("Invalid response from Foxpost", "Transient", {
        raw: serializeForLog(sanitizeResponseForLog(httpResponse)) as any,
      });
    }

    // Map carrier response -> CarrierResource[]
    const results: CarrierResource[] = carrierRespBody.map((item: any, idx: number) => {
      const errors = item.errors;
      if (errors && Array.isArray(errors) && errors.length > 0) {
        const errorDetails = errors.map((err: any) => ({
          field: err.field,
          code: err.message,
          message: `${err.field ? `Field '${err.field}': ` : ''}${err.message}`,
        }));

        ctx.logger?.warn("Foxpost: Return creation error", {
          idx,
          barcode: item.barcode,
          errorCount: errorDetails.length,
        });

        const failed: FailedCarrierResource = {
          carrierId: undefined,
          status: 'failed',
          raw: serializeForLog(item) as any,
          errors: errorDetails,
        };
        return failed;
      }

      const carrierId = item.newBarcode || item.barcode;
      if (!carrierId) {
        const failed: FailedCarrierResource = {
          carrierId: undefined,
          status: 'failed',
          raw: serializeForLog(item) as any,
          errors: [{
            code: 'NO_BARCODE',
            message: 'No barcode assigned by carrier',
          }],
        };
        return failed;
      }

      return {
        carrierId: String(carrierId),
        status: 'created',
        raw: serializeForLog(item) as any,
      };
    });

    const successCount = results.filter((r) => r.status === 'created').length;
    const failureCount = results.filter((r) => r.status === 'failed').length;
    const totalCount = results.length;

    let summary: string;
    if (failureCount === 0) {
      summary = `All ${totalCount} returns created successfully`;
    } else if (successCount === 0) {
      summary = `All ${totalCount} returns failed`;
    } else {
      summary = `Mixed results: ${successCount} succeeded, ${failureCount} failed`;
    }

    ctx.logger?.info("Foxpost: Returns creation finished", {
      count: results.length,
      testMode: useTestApi,
      summary,
      successCount,
      failureCount,
    });

    return {
      results,
      successCount,
      failureCount,
      totalCount,
      allSucceeded: failureCount === 0 && totalCount > 0,
      allFailed: successCount === 0 && totalCount > 0,
      someFailed: successCount > 0 && failureCount > 0,
      summary,
      rawCarrierResponse: serializeForLog(sanitizeResponseForLog(httpResponse)),
    };
  } catch (error) {
    ctx.logger?.error("Foxpost: Error creating returns batch", {
      error: errorToLog(error),
    });

    if (error instanceof CarrierError) {
      throw error;
    }

    throw translateFoxpostError(error);
  }
}
