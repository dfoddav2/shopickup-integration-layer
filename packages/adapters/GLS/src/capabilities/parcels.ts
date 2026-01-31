/**
 * GLS Parcel Creation Capability
 * 
 * Creates parcels and generates labels using GLS MyGLS API PrepareLabels endpoint.
 * 
 * IMPORTANT: This implementation is HU (Hungary) specific.
 * While the GLS MyGLS API supports multiple regions (CZ, HR, RO, SI, SK, RS),
 * this adapter has been tested and optimized for Hungary only.
 * 
 * Other countries may require:
 * - Adjusted service codes and parameters
 * - Country-specific address validation (e.g., Serbia requires senderIdentityCardNumber)
 * - Regional endpoint configuration
 * - Special field handling
 * 
 * Base URLs:
 * - Hungary (HU): https://api.mygls.hu/ParcelService.svc
 * - Czech Republic (CZ): https://api.mygls.cz/ParcelService.svc
 * - Croatia (HR): https://api.mygls.hr/ParcelService.svc
 * - Romania (RO): https://api.mygls.ro/ParcelService.svc
 * - Slovenia (SI): https://api.mygls.si/ParcelService.svc
 * - Slovakia (SK): https://api.mygls.sk/ParcelService.svc
 * - Serbia (RS): https://api.mygls.rs/ParcelService.svc
 * 
 * Test endpoints use api.test.mygls.{country} instead of api.mygls.{country}
 */

import type {
  CreateParcelRequest,
  CreateParcelsRequest,
  CreateParcelsResponse,
  AdapterContext,
  CarrierResource,
} from '@shopickup/core';
import {
  CarrierError,
  safeLog,
  serializeForLog,
  errorToLog,
} from '@shopickup/core';
import {
  mapCanonicalParcelToGLS,
  mapCanonicalParcelsToGLS,
  mapGLSParcelInfoToCarrierResource,
} from '../mappers/parcels.js';
import type { GLSPrepareLabelsResponse } from '../types/index.js';
import {
  hashPasswordSHA512,
  createGLSAuthHeader,
  resolveGLSBaseUrl,
  validateGLSCredentials,
} from '../utils/authentication.js';
import {
  safeValidateCreateParcelRequest,
  safeValidateCreateParcelsRequest,
  safeValidateGLSPrepareLabelsResponse,
} from '../validation/parcels.js';

/**
 * Create a single parcel in GLS
 * Delegates to createParcels to reuse batching logic
 */
export async function createParcel(
  req: CreateParcelRequest,
  ctx: AdapterContext,
  createParcelsImpl: (req: CreateParcelsRequest, ctx: AdapterContext) => Promise<CreateParcelsResponse>
): Promise<CarrierResource> {
  // Validate request format and credentials
  const validated = safeValidateCreateParcelRequest(req);
  if (!validated.success) {
    throw new CarrierError(
      `Invalid request: ${validated.error.message}`,
      'Validation',
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
    throw new CarrierError(
      'Unexpected response shape from createParcels',
      'Transient',
      { raw: serializeForLog(response) as any }
    );
  }

  const results = (response as CreateParcelsResponse).results;
  if (results.length === 0) {
    throw new CarrierError(
      'createParcels returned an empty results array',
      'Transient',
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
 * Maps canonical Parcel array to GLS PrepareLabels request and calls the
 * GLS MyGLS API batch endpoint.
 * 
 * @returns CreateParcelsResponse with summary and per-item results
 */
export async function createParcels(
  req: CreateParcelsRequest,
  ctx: AdapterContext
): Promise<CreateParcelsResponse> {
  try {
    // Validate request format and credentials
    const validated = safeValidateCreateParcelsRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error.message}`,
        'Validation',
        { raw: validated.error }
      );
    }

    if (!ctx.http) {
      throw new CarrierError(
        'HTTP client not provided in context',
        'Permanent'
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
        summary: 'No parcels to process',
      };
    }

    // Extract country and test mode from options
    const country = (req.options?.country as string) || 'HU';
    const useTestApi = (req.options?.useTestApi as boolean) || false;

    // Resolve GLS base URL
    const baseUrl = resolveGLSBaseUrl(country, useTestApi);

    // Extract and validate credentials
    const credentials = req.credentials as any;
    validateGLSCredentials({
      username: credentials.username,
      password: credentials.password,
      clientNumberList: credentials.clientNumberList,
    });

    // Hash the password for authentication
    const hashedPassword = hashPasswordSHA512(credentials.password);
    const authHeaders = createGLSAuthHeader(credentials.username, hashedPassword);

    // Get first client number (GLS requires one client number per request)
    const clientNumber = credentials.clientNumberList[0];

    // Map canonical parcels to GLS format
    // NOTE: Parcels DO NOT include auth fields - those go at the request root level per GLS API spec
    const glsParcelList = mapCanonicalParcelsToGLS(req.parcels, clientNumber);

    safeLog(
      ctx.logger,
      'debug',
      'GLS: Creating parcels batch',
      {
        count: req.parcels.length,
        country,
        testMode: useTestApi,
      },
      ctx,
      ['createParcels']
    );

    // Build GLS PrepareLabels request with auth at root level (per spec ver. 25.12.11)
    const glsRequest = {
      username: credentials.username,
      password: hashedPassword,
      clientNumberList: [clientNumber],
      webshopEngine: credentials.webshopEngine || 'shopickup-adapter/1.0',
      parcelList: glsParcelList,
    };

    // Call GLS PrepareLabels endpoint
    const httpResponse = await ctx.http.post(
      `${baseUrl}/json/PrepareLabels`,
      glsRequest,
      { headers: authHeaders }
    );

    // Extract body from response
    const carrierRespBody = httpResponse.body as GLSPrepareLabelsResponse;

    // Validate the response shape
    const responseValidation = safeValidateGLSPrepareLabelsResponse(carrierRespBody);
    if (!responseValidation.success) {
      safeLog(
        ctx.logger,
        'warn',
        'GLS: Response validation failed',
        {
          errors: serializeForLog(responseValidation.error.flatten()) as any,
        },
        ctx,
        ['createParcels']
      );
      // Continue anyway - be lenient with response shape
    }

    if (!carrierRespBody) {
      throw new CarrierError('Invalid response from GLS', 'Transient', {
        raw: serializeForLog(httpResponse) as any,
      });
    }

    // Check for API-level errors
    // GLS API returns both prepareLabelsError and PrepareLabelsError (case varies)
    const errorList = (carrierRespBody.prepareLabelsError || (carrierRespBody as any).PrepareLabelsError) as any[];
    if (errorList && errorList.length > 0) {
      const firstError = errorList[0];
      const errorCode = firstError.errorCode || firstError.ErrorCode;
      const errorDescription = firstError.errorDescription || firstError.ErrorDescription;
      
      // Determine error category based on error code
      let category: 'Auth' | 'Validation' | 'Permanent' | 'Transient' = 'Validation';
      if (errorCode === -1) {
        // -1 appears to be an authentication error not in Appendix A
        category = 'Auth';
      } else if (errorCode === 14 || errorCode === 15 || errorCode === 27) {
        // Authorization/access errors
        category = 'Auth';
      } else if (errorCode >= 1000) {
        // Internal errors (1000+) are likely permanent issues
        category = 'Permanent';
      }
      
      throw new CarrierError(
        `GLS API error: ${errorDescription} (code: ${errorCode})`,
        category,
        {
          carrierCode: errorCode.toString(),
          raw: serializeForLog(firstError) as any,
        }
      );
    }

    // Map carrier response array -> CarrierResource[]
    const results: CarrierResource[] = (carrierRespBody.parcelInfoList || []).map(
      (p: any, idx: number) => mapGLSParcelInfoToCarrierResource(p, idx)
    );

    // Calculate summary statistics
    const successCount = results.filter((r) => r.status === 'created').length;
    const failureCount = results.filter((r) => r.status === 'failed').length;
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

    safeLog(
      ctx.logger,
      'info',
      'GLS: Parcels creation finished',
      {
        count: results.length,
        testMode: useTestApi,
        summary,
        successCount,
        failureCount,
      },
      ctx,
      ['createParcels']
    );

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
    safeLog(
      ctx.logger,
      'error',
      'GLS: Error creating parcels batch',
      {
        error: errorToLog(error),
      },
      ctx,
      ['createParcels']
    );

    if (error instanceof CarrierError) {
      throw error;
    }

    // Translate unknown errors
    if ((error as any).response?.status === 401 || (error as any).response?.status === 403) {
      throw new CarrierError('GLS authentication failed', 'Permanent', { raw: error });
    }

    throw new CarrierError(
      `GLS error: ${error instanceof Error ? error.message : String(error)}`,
      'Transient',
      { raw: error }
    );
  }
}
