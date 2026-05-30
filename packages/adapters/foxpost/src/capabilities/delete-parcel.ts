/**
 * Foxpost Adapter: Delete Parcel Capability
 * Handles DELETE_PARCEL operation
 * 
 * Foxpost endpoint: DELETE /api/parcel/{barcode}
 */

import type {
  AdapterContext,
  DeleteParcelRequest,
  DeleteParcelResult,
} from "@shopickup/core";
import { CarrierError, errorToLog, serializeForLog } from "@shopickup/core";
import { translateFoxpostError, sanitizeResponseForLog } from '../errors.js';
import { buildFoxpostHeaders } from '../utils/httpUtils.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';
import {
  safeValidateDeleteParcelRequest,
  safeValidateFoxpostApiError,
  type FoxpostDeleteParcelOptions,
} from '../validation.js';

/**
 * Delete a parcel from Foxpost by its barcode.
 * 
 * @param req DeleteParcelRequest with parcelCarrierId (barcode)
 * @param ctx Adapter context with HTTP client
 * @param resolveBaseUrl Base URL resolver for test/production selection
 * @returns DeleteParcelResult indicating success or failure
 */
export async function deleteParcel(
  req: DeleteParcelRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<DeleteParcelResult> {
  try {
    // Validate request format and credentials
    const validated = safeValidateDeleteParcelRequest(req);
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

    const barcode = validated.data.parcelCarrierId;
    const useTestApi = validated.data.options?.useTestApi ?? false;
    const isWeb = (validated.data.options as FoxpostDeleteParcelOptions | undefined)?.foxpost?.isWeb ?? true;
    const baseUrl = resolveBaseUrl({ useTestApi });

    ctx.logger?.debug("Foxpost: Deleting parcel", {
      barcode,
      testMode: useTestApi,
      isWeb,
    });

    const url = `${baseUrl}/api/parcel/${encodeURIComponent(barcode)}?isWeb=${isWeb}`;

    const httpResponse = await ctx.http.delete(url, {
      headers: buildFoxpostHeaders(validated.data.credentials as any),
    });

    // Foxpost returns 200 or 204 on success, 400/401 on error
    const status = (httpResponse as any).statusCode || (httpResponse as any).status;

    if (status === 200 || status === 204) {
      ctx.logger?.info("Foxpost: Parcel deleted successfully", {
        barcode,
        testMode: useTestApi,
      });

      return {
        carrierId: barcode,
        status: 'deleted',
        raw: serializeForLog(sanitizeResponseForLog(httpResponse)) as any,
      };
    }

    // Unexpected status code — try to parse error body
    const body = (httpResponse as any).body;
    let errorMessage = `Unexpected status ${status} when deleting parcel ${barcode}`;
    let errorCategory: 'Validation' | 'Auth' | 'Transient' = 'Transient';

    if (body) {
      const apiErrorValidation = safeValidateFoxpostApiError(body);
      if (apiErrorValidation.success && apiErrorValidation.data.error) {
        errorMessage = apiErrorValidation.data.error;
      }
    }

    if (status === 400) {
      errorCategory = 'Validation';
    } else if (status === 401 || status === 403) {
      errorCategory = 'Auth';
    }

    throw new CarrierError(
      errorMessage,
      errorCategory,
      { raw: serializeForLog(sanitizeResponseForLog(httpResponse)) as any }
    );
  } catch (error) {
    if (error instanceof CarrierError) {
      return {
        carrierId: req.parcelCarrierId,
        status: 'failed',
        errors: [{
          code: error.carrierCode || String(error.category),
          message: error.message,
        }],
        raw: error.raw,
      };
    }

    ctx.logger?.error("Foxpost: Error deleting parcel", {
      barcode: req.parcelCarrierId,
      error: errorToLog(error),
    });

    const translated = translateFoxpostError(error);
    return {
      carrierId: req.parcelCarrierId,
      status: 'failed',
      errors: [{
        code: (translated as CarrierError).carrierCode || 'UNKNOWN',
        message: translated.message,
      }],
      raw: error,
    };
  }
}
