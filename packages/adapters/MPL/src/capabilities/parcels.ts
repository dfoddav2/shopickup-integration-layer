/**
 * MPL Adapter: Parcel Creation Capability
 * 
 * Handles CREATE_PARCEL and CREATE_PARCELS operations.
 * Maps canonical Parcel objects to MPL ShipmentCreateRequest format
 * and submits them via POST /shipments endpoint.
 * 
 * Supports:
 * - Single parcel creation (createParcel)
 * - Batch creation up to 100 shipments (createParcels)
 * - Partial failure handling (per-shipment results)
 * - Label generation with configurable format
 * - OAuth token exchange with fallback support
 */

import type {
  CreateParcelRequest,
  CreateParcelsRequest,
  CreateParcelsResponse,
  CarrierResource,
  FailedCarrierResource,
  AdapterContext,
  ParcelValidationError,
} from '@shopickup/core';
import {
  CarrierError,
  serializeForLog,
  errorToLog,
} from '@shopickup/core';

import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';
import {
  safeValidateCreateParcelRequest,
  safeValidateCreateParcelsRequest,
  safeValidateShipmentCreateRequest,
  safeValidateShipmentCreateResult,
  type CreateParcelMPLRequest,
  type CreateParcelsMPLRequest,
  type ShipmentCreateResult,
  type ErrorDescriptor,
} from '../validation.js';
import { mapParcelsToMPLShipments } from '../mappers/shipment.js';
import { buildMPLHeaders } from '../utils/httpUtils.js';

/**
 * Translates MPL error to CarrierError with appropriate category
 */
function translateMPLShipmentError(
  error: unknown,
): CarrierError {
  if (error instanceof CarrierError) {
    return error;
  }

  if (error && typeof error === 'object') {
    const err = error as any;

    // Check for HTTP response status
    if (err.status) {
      if (err.status === 400 || err.status === 404) {
        return new CarrierError(
          `Validation error: ${err.message || 'Invalid request'}`,
          'Validation',
          { raw: serializeForLog(err) as any },
        );
      } else if (err.status === 401 || err.status === 403) {
        return new CarrierError(
          `Authentication error: ${err.message || 'Unauthorized'}`,
          'Auth',
          { raw: serializeForLog(err) as any },
        );
      } else if (err.status === 429) {
        return new CarrierError(
          `Rate limit exceeded: ${err.message || 'Too many requests'}`,
          'RateLimit',
          { raw: serializeForLog(err) as any },
        );
      } else if (err.status >= 500) {
        return new CarrierError(
          `Server error: ${err.message || 'Internal server error'}`,
          'Transient',
          { raw: serializeForLog(err) as any },
        );
      }
    }

    // Check for MPL-specific error structure
    if (err.fault?.faultstring) {
      return new CarrierError(
        `MPL error: ${err.fault.faultstring}`,
        'Transient',
        { raw: serializeForLog(err) as any },
      );
    }

    return new CarrierError(
      `Shipment creation error: ${err.message || 'Unknown error'}`,
      'Transient',
      { raw: serializeForLog(err) as any },
    );
  }

  return new CarrierError(
    `Shipment creation error: ${String(error)}`,
    'Transient',
  );
}

/**
 * Create a single parcel in MPL
 * Delegates to createParcels to reuse batching logic
 */
export async function createParcel(
  req: CreateParcelMPLRequest,
  ctx: AdapterContext,
  createParcelsImpl: (
    req: CreateParcelsMPLRequest,
    ctx: AdapterContext,
  ) => Promise<CreateParcelsResponse>,
): Promise<CarrierResource> {
  const validated = safeValidateCreateParcelRequest(req);
  if (!validated.success) {
    throw new CarrierError(
      `Invalid request: ${validated.error.message}`,
      'Validation',
      { raw: serializeForLog(validated.error.issues) as any },
    );
  }

  const parsedReq = validated.data;

  const batchReq: CreateParcelsMPLRequest = {
    parcels: [parsedReq.parcel],
    credentials: parsedReq.credentials,
    options: parsedReq.options,
  };

  const response = await createParcelsImpl(batchReq, ctx);

  // Validate response shape
  if (!response || !Array.isArray((response as CreateParcelsResponse).results)) {
    throw new CarrierError(
      'Unexpected response shape from createParcels',
      'Transient',
      { raw: serializeForLog(response) as any },
    );
  }

  const results = (response as CreateParcelsResponse).results;
  if (results.length === 0) {
    throw new CarrierError(
      'createParcels returned an empty results array',
      'Transient',
      { raw: serializeForLog(response) as any },
    );
  }

  // Return the first parcel result, attach full response for context
  const result = results[0];
  if (result.status === 'failed') {
    const firstError = result.errors?.[0]?.message;
    throw new CarrierError(
      firstError
        ? `Parcel creation failed: ${firstError}`
        : 'Parcel creation failed',
      'Validation',
      {
        raw: serializeForLog({
          result,
          rawCarrierResponse: response.rawCarrierResponse,
        }) as any,
      },
    );
  }

  return {
    ...result,
    rawCarrierResponse: response.rawCarrierResponse,
  } as CarrierResource & { rawCarrierResponse?: unknown };
}

/**
 * Create multiple parcels in one call
 * 
 * Maps canonical Parcel array to MPL ShipmentCreateRequest array.
 * Supports up to 100 shipments per call (OpenAPI constraint).
 * Returns per-item CarrierResource so callers can handle partial failures.
 * 
 * @returns CreateParcelsResponse with summary and per-item results
 */
export async function createParcels(
  req: CreateParcelsMPLRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<CreateParcelsResponse> {
  try {
    const validated = safeValidateCreateParcelsRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error.message}`,
        'Validation',
        { raw: serializeForLog(validated.error.issues) as any },
      );
    }

    const parsedReq = validated.data;
    const internalOptions = {
      useTestApi: parsedReq.options.useTestApi ?? false,
      labelType: parsedReq.options.mpl.labelType,
      accountingCode: parsedReq.options.mpl.accountingCode,
      agreementCode: parsedReq.options.mpl.agreementCode,
      bankAccountNumber: parsedReq.options.mpl.bankAccountNumber,
    };

    // Validate we have required context
    if (!ctx.http) {
      throw new CarrierError(
        'HTTP client not provided in context',
        'Permanent',
      );
    }

    if (!Array.isArray(parsedReq.parcels) || parsedReq.parcels.length === 0) {
      return {
        results: [],
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        allSucceeded: false,
        allFailed: false,
        someFailed: false,
        summary: 'No parcels to process',
      };
    }

    // Enforce batch size limit (OpenAPI: max 100 shipments per call)
    if (parsedReq.parcels.length > 100) {
      throw new CarrierError(
        `Too many parcels: ${parsedReq.parcels.length} > 100 (MPL API limit)`,
        'Validation',
        { raw: { maxAllowed: 100, requested: parsedReq.parcels.length } },
      );
    }

    const baseUrl = resolveBaseUrl({ useTestApi: internalOptions.useTestApi });
    const useTestApi = internalOptions.useTestApi;

    ctx.logger?.debug('MPL: Creating parcels batch', {
      count: parsedReq.parcels.length,
      testMode: useTestApi,
    });

    // Extract sender information from first parcel (assumes uniform sender across batch)
    const firstParcel = parsedReq.parcels[0];
    if (!firstParcel.shipper) {
      throw new CarrierError(
        'Missing shipper information in parcel',
        'Validation',
      );
    }

    // Map canonical parcels to MPL shipments
    const mplShipments = mapParcelsToMPLShipments(
      parsedReq.parcels,
      firstParcel.shipper,
      internalOptions.agreementCode,
      internalOptions.bankAccountNumber,
      internalOptions.labelType as any, // Cast to satisfy type constraint
    );

    ctx.logger?.debug('MPL: Mapped parcels to MPL shipments', {
      shipments: serializeForLog(mplShipments) as any,
    });

    // Validate each mapped shipment
    const mplShipmentsWithValidation = mplShipments.map((shipment, idx) => {
      const validation = safeValidateShipmentCreateRequest(shipment);
      if (!validation.success) {
        ctx.logger?.warn('MPL: Shipment validation failed', {
          shipmentIdx: idx,
          errors: serializeForLog(validation.error.issues) as any,
        });
        // Continue anyway - be lenient
      }
      return shipment;
    });

    // Call MPL API
    const httpResponse = await ctx.http.post<ShipmentCreateResult[]>(
      `${baseUrl}/shipments`,
      mplShipmentsWithValidation,
      {
        headers: buildMPLHeaders(parsedReq.credentials as any, internalOptions.accountingCode),
      },
    );

    // Extract and validate response body
    const carrierRespBody = httpResponse.body as ShipmentCreateResult[] | unknown;

    if (!Array.isArray(carrierRespBody)) {
      throw new CarrierError(
        'Invalid response from MPL: expected array',
        'Transient',
        { raw: serializeForLog(carrierRespBody) as any },
      );
    }

    // Process each result
    const results: CarrierResource[] = carrierRespBody.map(
      (result: ShipmentCreateResult, idx: number) => {
        // Validate result shape
        const resultValidation = safeValidateShipmentCreateResult(result);
        if (!resultValidation.success) {
          ctx.logger?.warn('MPL: Result validation failed', {
            resultIdx: idx,
            errors: serializeForLog(resultValidation.error.issues) as any,
          });
        }

        // Check for errors in result
        if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
          const errors: ParcelValidationError[] = result.errors.map(
            (err: ErrorDescriptor): ParcelValidationError => ({
              field: err.parameter || 'unknown',
              code: err.code || 'UNKNOWN_ERROR',
              message: `${err.text || err.text_eng || 'Unknown error'}`,
            }),
          );

          ctx.logger?.warn('MPL: Shipment errors', {
            shipmentIdx: idx,
            webshopId: result.webshopId,
            errorCount: errors.length,
            errorSummary: errors.map(e => `${e.field}: ${e.code}`),
            errors: serializeForLog(errors) as any,
          });

          const failedResource: FailedCarrierResource = {
            carrierId: undefined,
            status: 'failed',
            raw: serializeForLog(result) as any,
            errors,
          };

          return failedResource;
        }

        // Check for tracking number (indicates success)
        if (!result.trackingNumber) {
          ctx.logger?.warn('MPL: No tracking number in result', {
            shipmentIdx: idx,
            webshopId: result.webshopId,
          });

          const failedResource: FailedCarrierResource = {
            carrierId: undefined,
            status: 'failed',
            raw: serializeForLog(result) as any,
            errors: [
              {
                field: 'trackingNumber',
                code: 'NO_TRACKING_NUMBER',
                message: 'No tracking number assigned by carrier',
              },
            ],
          };

          return failedResource;
        }

        // Success - shipment created with tracking number
        const successResource: CarrierResource = {
          carrierId: result.trackingNumber,
          status: 'created',
          raw: serializeForLog(result) as any,
        };

        ctx.logger?.debug('MPL: Shipment created', {
          shipmentIdx: idx,
          trackingNumber: result.trackingNumber,
          webshopId: result.webshopId,
        });

        return successResource;
      },
    );

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

    ctx.logger?.info('MPL: Parcels creation finished', {
      count: totalCount,
      testMode: useTestApi,
      summary,
      successCount,
      failureCount,
    });

    // Return strongly-typed response with a sanitized carrier response for debugging
    // Avoid serializing the whole httpResponse (which may contain streams/buffers)
    // — include only the most useful parts: status, headers, body
    return {
      results,
      successCount,
      failureCount,
      totalCount,
      allSucceeded: failureCount === 0 && totalCount > 0,
      allFailed: successCount === 0 && totalCount > 0,
      someFailed: successCount > 0 && failureCount > 0,
      summary,
      rawCarrierResponse: serializeForLog({ status: httpResponse.status, headers: httpResponse.headers, body: httpResponse.body }),
    };
  } catch (error) {
    ctx.logger?.error('MPL: Error creating parcels batch', {
      error: errorToLog(error),
    });

    if (error instanceof CarrierError) {
      throw error;
    }

    throw translateMPLShipmentError(error);
  }
}
