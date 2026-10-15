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
  FailedCarrierResource,
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
  resolveGLSBaseUrl,
  resolveGLSEndpointCountry,
  validateGLSCredentials,
  convertToPascalCase,
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

    // Results are paired with parcels by id, so ids must be unique in a batch.
    const parcelIds = req.parcels.map((p: any) => p.id);
    const duplicateId = parcelIds.find((id: string, i: number) => parcelIds.indexOf(id) !== i);
    if (duplicateId !== undefined) {
      throw new CarrierError(
        `Duplicate parcel id in batch: ${duplicateId}. Parcel ids must be unique because GLS results are matched by client reference.`,
        'Validation',
        { carrierCode: 'hu-gls' }
      );
    }

    // Extract country and test mode from options
    const explicitCountry = (req.options as any)?.gls?.country || (req.options as any)?.country;
    const shipperCountries = new Set(
      req.parcels.map((p: any) => (p.shipper?.address?.country as string | undefined)?.toUpperCase() || 'HU')
    );
    if (!explicitCountry && shipperCountries.size > 1) {
      throw new CarrierError(
        `Parcels in one request have different sender countries (${[...shipperCountries].join(', ')}); set options.gls.country or split the batch.`,
        'Validation',
        { carrierCode: 'hu-gls' }
      );
    }
    const country = resolveGLSEndpointCountry(req.options as any, [...shipperCountries][0]);
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
    // Password is converted to byte array and included in JSON body
    const hashedPassword = hashPasswordSHA512(credentials.password);

    // Get first client number (GLS requires one client number per request)
    const clientNumber = credentials.clientNumberList[0];

    // Map canonical parcels to GLS format
    // NOTE: Parcels DO NOT include auth fields - those go at the request root level per GLS API spec
    const glsOptions = (req.options as any)?.gls;
    const rootOptions = (req.options as any) ?? {};
    const glsParcelList = mapCanonicalParcelsToGLS(req.parcels, clientNumber, {
      ...glsOptions,
      useTestApi,
      flexDeliveryServiceEmailFDS: rootOptions.flexDeliveryServiceEmailFDS ?? glsOptions?.flexDeliveryServiceEmailFDS,
      flexDeliveryServiceSmsFSS: rootOptions.flexDeliveryServiceSmsFSS ?? glsOptions?.flexDeliveryServiceSmsFSS,
    }, ctx.logger);

    safeLog(
      ctx.logger,
      'debug',
      'GLS: Created GLS parcels',
      {
        count: glsParcelList.length,
        parcelList: glsParcelList.map((p: any) => ({
          clientReference: p.clientReference,
          serviceList: p.serviceList,
        })),
      },
      ctx,
      ['createParcels']
    );

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
    // TESTING: Converting to PascalCase to match PHP example exactly
    const glsRequestCamelCase = {
      username: credentials.username,
      password: hashedPassword,
      clientNumberList: [clientNumber],
      webshopEngine: credentials.webshopEngine || 'shopickup-adapter/1.0',
      parcelList: glsParcelList,
    };

    // Convert to PascalCase (matching PHP example)
    const glsRequest = convertToPascalCase(glsRequestCamelCase);

    // Log request for debugging (sanitize sensitive data)
    safeLog(
      ctx.logger,
      'debug',
      'GLS: Request payload',
      {
        url: `${baseUrl}/json/PrepareLabels`,
        requestKeys: Object.keys(glsRequest),
        hasUsername: !!glsRequest.Username,
        hasPassword: Array.isArray(glsRequest.Password),
        passwordLength: glsRequest.Password?.length,
        clientNumberList: glsRequest.ClientNumberList,
        parcelCount: glsRequest.ParcelList?.length,
      },
      ctx,
      ['createParcels', 'debug']
    );

    // Call GLS PrepareLabels endpoint
    // No HTTP Basic Auth header needed - password is in JSON body as byte array
    const httpResponse = await ctx.http.post(
      `${baseUrl}/json/PrepareLabels`,
      glsRequest
    );

    // Log response for debugging
    safeLog(
      ctx.logger,
      'debug',
      'GLS: Response received',
      {
        statusCode: (httpResponse as any).statusCode || 'unknown',
        hasBody: !!httpResponse.body,
        bodyKeys: httpResponse.body ? Object.keys(httpResponse.body).slice(0, 5) : [],
        bodyPreview: httpResponse.body ? JSON.stringify(httpResponse.body).substring(0, 200) : 'none',
      },
      ctx,
      ['createParcels', 'debug']
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
          errors: serializeForLog(responseValidation.error.issues) as any,
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

    // GLS answers with two separate lists (successes, then errors) that are
    // NOT in input order. Pair everything with the input parcels through the
    // client reference (= parcel.id) and return one result per input parcel,
    // in input order, so callers can never mislink a result to another parcel.
    const parcelList = (carrierRespBody.parcelInfoList || (carrierRespBody as any).ParcelInfoList || []) as any[];
    const errorList = (carrierRespBody.prepareLabelsError || (carrierRespBody as any).PrepareLabelsError || []) as any[];

    if (parcelList.length === 0 && errorList.length === 0) {
      throw new CarrierError('GLS returned no parcel results', 'Transient', { raw: carrierRespBody as any });
    }

    const inputIds: string[] = req.parcels.map((p: any) => p.id);
    const inputIdSet = new Set(inputIds);

    // Errors by client reference. One GLS error can list several references.
    // Errors without any reference apply to the batch as a whole.
    const errorsByRef = new Map<string, any[]>();
    const unattributedErrors: any[] = [];
    for (const err of errorList) {
      const refs: string[] = err.clientReferenceList || err.ClientReferenceList || [];
      const known = refs.filter((r) => inputIdSet.has(r));
      if (known.length === 0) {
        unattributedErrors.push(err);
        continue;
      }
      for (const ref of known) {
        if (!errorsByRef.has(ref)) errorsByRef.set(ref, []);
        errorsByRef.get(ref)!.push(err);
      }
    }

    // Successes by client reference.
    const successByRef = new Map<string, any>();
    const unreferencedSuccesses: any[] = [];
    for (const info of parcelList) {
      const ref = info.clientReference ?? info.ClientReference;
      if (ref != null && inputIdSet.has(ref) && !successByRef.has(ref)) {
        successByRef.set(ref, info);
      } else {
        unreferencedSuccesses.push(info);
      }
    }

    const buildFailure = (inputId: string, errors: any[]): FailedCarrierResource => {
      const errorCode = errors[0].errorCode ?? errors[0].ErrorCode;
      const errorDescription = errors[0].errorDescription || errors[0].ErrorDescription || 'Unknown error';

      let category: 'Auth' | 'Validation' | 'Permanent' | 'Transient' = 'Validation';
      if (errorCode === -1 || errorCode === 14 || errorCode === 15 || errorCode === 27) {
        category = 'Auth';
      } else if (errorCode >= 1000) {
        category = 'Permanent';
      }

      safeLog(
        ctx.logger,
        'warn',
        'GLS: Parcel creation error',
        { inputId, errorCode, errorDescription, category, errorCount: errors.length },
        ctx,
        ['createParcels']
      );

      return {
        inputId,
        carrierId: undefined,
        status: 'failed',
        raw: serializeForLog(errors) as any,
        errors: errors.map((err: any) => ({
          code: String(err.errorCode ?? err.ErrorCode),
          message: err.errorDescription || err.ErrorDescription || 'Unknown error',
        })),
      };
    };

    const results: CarrierResource[] = inputIds.map((inputId) => {
      const errors = errorsByRef.get(inputId);
      if (errors) return buildFailure(inputId, errors);

      const info = successByRef.get(inputId);
      if (info) return mapGLSParcelInfoToCarrierResource(info, 0);

      // In neither list: do not guess. Report it as failed so the caller never
      // treats a parcel GLS did not confirm as created.
      if (unattributedErrors.length > 0) return buildFailure(inputId, unattributedErrors);
      safeLog(
        ctx.logger,
        'warn',
        'GLS: Parcel missing from response',
        { inputId },
        ctx,
        ['createParcels']
      );
      return {
        inputId,
        carrierId: undefined,
        status: 'failed',
        raw: undefined,
        errors: [{ code: 'NO_RESULT', message: 'GLS returned neither a result nor an error for this parcel' }],
      } as FailedCarrierResource;
    });

    // Successes GLS returned that we cannot tie to an input parcel (no or
    // unknown ClientReference). They exist at GLS, so never drop them silently.
    if (unreferencedSuccesses.length > 0) {
      safeLog(
        ctx.logger,
        'error',
        'GLS: Successful parcels without a matching client reference',
        { count: unreferencedSuccesses.length },
        ctx,
        ['createParcels']
      );
      for (const info of unreferencedSuccesses) {
        const orphan = mapGLSParcelInfoToCarrierResource(info, 0);
        orphan.inputId = undefined;
        results.push(orphan);
      }
    }

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
      rawCarrierResponse: serializeForLog(carrierRespBody),
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
      throw new CarrierError('GLS authentication failed', 'Auth', { raw: error });
    }

    throw new CarrierError(
      `GLS error: ${error instanceof Error ? error.message : String(error)}`,
      'Transient',
      { raw: error }
    );
  }
}
