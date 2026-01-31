/**
 * GLS Pickup Points Capability
 * 
 * Fetches and normalizes the list of delivery points (pickup shops, lockers, etc.)
 * from the GLS public pickup points feed.
 * 
 * URL: https://map.gls-hungary.com/data/deliveryPoints/{country}.json
 * 
 * Supported countries:
 * AT (Austria), BE (Belgium), BG (Bulgaria), CZ (Czech Republic), DE (Germany),
 * DK (Denmark), ES (Spain), FI (Finland), FR (France), GR (Greece), HR (Croatia),
 * HU (Hungary), IT (Italy), LU (Luxembourg), NL (Netherlands), PL (Poland),
 * PT (Portugal), RO (Romania), SI (Slovenia), SK (Slovakia), RS (Serbia)
 * 
 * ============================================
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
  FetchPickupPointsRequest,
  FetchPickupPointsResponse,
  AdapterContext,
  CreateParcelRequest,
  CreateParcelsRequest,
  CreateParcelsResponse,
  CreateLabelsResponse,
  CarrierResource,
  FailedCarrierResource,
  ParcelValidationError,
  TrackingRequest,
  TrackingUpdate,
} from '@shopickup/core';
import {
  CarrierError,
  safeLog,
  createLogEntry,
  serializeForLog,
  errorToLog,
} from '@shopickup/core';
import { mapGLSDeliveryPointsToPickupPoints } from '../mappers/index.js';
import {
  mapCanonicalParcelToGLS,
  mapCanonicalParcelsToGLS,
  mapGLSParcelInfoToCarrierResource,
} from '../mappers/parcels.js';
import {
  mapGLSTrackingResponseToCanonical,
} from '../mappers/tracking.js';
import type { GLSDeliveryPointsFeed, GLSPrepareLabelsResponse } from '../types/index.js';
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
import {
  safeValidateTrackingRequest,
  safeValidateGLSTrackingRequest,
  safeValidateGLSTrackingResponse,
} from '../validation/tracking.js';


const GLS_PICKUP_POINTS_BASE_URL = 'https://map.gls-hungary.com/data/deliveryPoints';

/**
 * Supported GLS countries (ISO 3166-1 alpha-2)
 */
const SUPPORTED_COUNTRIES = new Set([
  'at', // Austria
  'be', // Belgium
  'bg', // Bulgaria
  'cz', // Czech Republic
  'de', // Germany
  'dk', // Denmark
  'es', // Spain
  'fi', // Finland
  'fr', // France
  'gr', // Greece
  'hr', // Croatia
  'hu', // Hungary
  'it', // Italy
  'lu', // Luxembourg
  'nl', // Netherlands
  'pl', // Poland
  'pt', // Portugal
  'ro', // Romania
  'si', // Slovenia
  'sk', // Slovakia
  'rs', // Serbia
]);

/**
 * Validates that country code is in supported format and supported by GLS
 */
function validateCountryCode(country?: string): { valid: boolean; normalized?: string; error?: string } {
  if (!country) {
    return { valid: false, error: 'Country code is required' };
  }

  const normalized = country.toLowerCase().trim();

  // Check format (should be 2 characters)
  if (normalized.length !== 2) {
    return { valid: false, error: `Invalid country code format: ${country}. Expected 2-letter ISO code.` };
  }

  // Check if supported
  if (!SUPPORTED_COUNTRIES.has(normalized)) {
    return { valid: false, error: `Country not supported by GLS: ${country}. Supported: ${Array.from(SUPPORTED_COUNTRIES).join(', ')}` };
  }

  return { valid: true, normalized };
}

/**
 * Translates HTTP errors to CarrierError with appropriate category
 */
function translateHttpError(status: number, statusText: string): CarrierError {
  let category: 'Validation' | 'Transient' | 'Permanent' = 'Transient';
  let message = `GLS API error: ${statusText}`;

  if (status === 400 || status === 404) {
    category = 'Validation';
    message = `Country not found in GLS pickup points feed (${status})`;
  } else if (status === 401 || status === 403) {
    category = 'Permanent';
    message = `Access denied to GLS pickup points feed (${status})`;
  } else if (status >= 500) {
    category = 'Transient';
    message = `GLS server error (${status})`;
  }

  return new CarrierError(message, category, { raw: { status } });
}

/**
 * Fetch pickup points from GLS public feed
 * 
 * The GLS public pickup points feed is unauthenticated and returns all delivery points
 * for a given country.
 * 
 * @param req FetchPickupPointsRequest with country code required in credentials or options
 * @param ctx AdapterContext with HTTP client
 * @returns FetchPickupPointsResponse with normalized pickup points
 * @throws CarrierError on validation, network, or parsing errors
 */
export async function fetchPickupPoints(
  req: FetchPickupPointsRequest,
  ctx: AdapterContext
): Promise<FetchPickupPointsResponse> {
  if (!ctx.http) {
    throw new CarrierError('HTTP client not provided in adapter context', 'Permanent', {
      raw: 'Missing ctx.http',
    });
  }

  try {
    // Extract country from request
    // Country can be in credentials or in options (custom field)
    const countryFromCredentials = (req.credentials?.country as string) || '';
    const countryFromOptions = (req.options?.country as string) || '';
    const country = countryFromOptions || countryFromCredentials;

    // Validate country code
    const validation = validateCountryCode(country);
    if (!validation.valid) {
      throw new CarrierError(validation.error || 'Invalid country code', 'Validation', {
        raw: validation.error,
      });
    }

    const normalizedCountry = validation.normalized!;

    safeLog(
      ctx.logger,
      'debug',
      'Fetching GLS pickup points',
      createLogEntry({ country: normalizedCountry, endpoint: '/data/deliveryPoints/{country}.json' }, null, ctx, ['fetchPickupPoints']),
      ctx,
      ['fetchPickupPoints']
    );

    // Construct URL
    const url = `${GLS_PICKUP_POINTS_BASE_URL}/${normalizedCountry}.json`;

    // Fetch from GLS public feed (no authentication required)
    let response: any;
    try {
      response = await ctx.http.get<GLSDeliveryPointsFeed>(url);
    } catch (err) {
      // Handle axios errors
      if ((err as any).response) {
        const axiosErr = err as any;
        const status = axiosErr.response?.status;
        const statusText = axiosErr.response?.statusText || 'Unknown error';
        throw translateHttpError(status, statusText);
      }
      // Re-throw if it's already a CarrierError
      if (err instanceof CarrierError) {
        throw err;
      }
      throw new CarrierError(`Failed to fetch from GLS: ${(err as Error).message}`, 'Transient', {
        raw: err,
      });
    }

    // Validate response structure
    // Handle both response formats:
    // 1. Axios: returns data directly as { items: [...] }
    // 2. Wrapped: { status, body, statusText } format
    let body: GLSDeliveryPointsFeed;
    
    if (response && response.items) {
      // Direct format (axios)
      body = response;
    } else if (response && response.body) {
      // Wrapped format
      if (response.status !== 200) {
        throw translateHttpError(response.status, response.statusText || 'Unknown error');
      }
      body = response.body;
    } else {
      throw new CarrierError('Invalid response format from GLS: expected { items: [...] }', 'Permanent', {
        raw: response,
      });
    }

    // Validate that we got an items array
    if (!body || !Array.isArray(body.items)) {
      throw new CarrierError('Invalid response format from GLS: expected { items: [...] }', 'Permanent', {
        raw: body,
      });
    }

    const items = body.items;

    if (items.length === 0) {
      safeLog(
        ctx.logger,
        'debug',
        'GLS returned empty pickup points array',
        createLogEntry({ country: normalizedCountry, count: 0 }, null, ctx, ['fetchPickupPoints']),
        ctx,
        ['fetchPickupPoints']
      );

      return {
        points: [],
        summary: {
          totalCount: 0,
          updatedAt: new Date().toISOString(),
        },
        rawCarrierResponse: items,
      };
    }

    // Map delivery points to canonical format
    const points = mapGLSDeliveryPointsToPickupPoints(items, normalizedCountry);

    safeLog(
      ctx.logger,
      'info',
      'Successfully fetched GLS pickup points',
      {
        country: normalizedCountry,
        count: points.length,
      },
      ctx,
      ['fetchPickupPoints']
    );

    return {
      points,
      summary: {
        totalCount: points.length,
        updatedAt: new Date().toISOString(),
      },
      rawCarrierResponse: items,
    };
  } catch (err) {
    // Pass through CarrierErrors
    if (err instanceof CarrierError) {
      throw err;
    }

    // Wrap unknown errors
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger?.error('Failed to fetch GLS pickup points', {
      error: errorMessage,
      type: err instanceof Error ? err.constructor.name : typeof err,
    });

    throw new CarrierError(`Failed to fetch GLS pickup points: ${errorMessage}`, 'Transient', {
      raw: err,
    });
  }
}

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
    const glsParcels = mapCanonicalParcelsToGLS(req.parcels, clientNumber);

    // Add authentication to each parcel
    const glsParcelList = glsParcels.map((p) => ({
      ...p,
      username: credentials.username,
      password: hashedPassword,
      clientNumberList: [clientNumber],
      webshopEngine: credentials.webshopEngine || 'shopickup-adapter/1.0',
    }));

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

    // Call GLS PrepareLabels endpoint
    const httpResponse = await ctx.http.post(
      `${baseUrl}/CreateParcel`,
      { parcelList: glsParcelList },
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
    if (carrierRespBody.prepareLabelsError && carrierRespBody.prepareLabelsError.length > 0) {
      const firstError = carrierRespBody.prepareLabelsError[0];
      throw new CarrierError(
        `GLS API error: ${firstError.errorDescription} (code: ${firstError.errorCode})`,
        'Validation',
        {
          carrierCode: firstError.errorCode.toString(),
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

/**
 * Create a single label
 * Delegates to createLabels for batch processing
 */
export async function createLabel(
  req: any, // CreateLabelRequest type
  ctx: AdapterContext,
  createLabelsImpl: (req: any, ctx: AdapterContext) => Promise<any>
): Promise<any> {
  // Import validators
  const { safeValidateCreateLabelsRequest } = await import('../validation/labels.js');
  
  // Create batch request with single parcel ID
  const batchReq = {
    parcelCarrierIds: [req.parcelCarrierId],
    credentials: req.credentials,
    options: req.options,
  };

  const response = await createLabelsImpl(batchReq, ctx);

  // Return first result or throw if empty
  if (!response || !Array.isArray(response.results) || response.results.length === 0) {
    throw new CarrierError(
      'createLabels returned empty results',
      'Transient',
      { raw: serializeForLog(response) as any }
    );
  }

  const result = response.results[0];
  return {
    ...result,
    rawCarrierResponse: response.rawCarrierResponse,
  };
}

/**
 * Create multiple labels in batch
 * 
 * Maps canonical CreateLabelsRequest to GLS PrintLabels request and retrieves PDF labels.
 * The parcelCarrierIds should be GLS parcel IDs from a prior CreateParcels call.
 * 
 * Returns PDF bytes in rawCarrierResponse for integrator to store/upload.
 * Per-label metadata is in files array.
 * 
 * IMPORTANT: This is HU-specific implementation.
 * 
 * @param req CreateLabelsRequest with parcel carrier IDs
 * @param ctx Adapter context with HTTP client
 * @returns CreateLabelsResponse with file metadata and PDF bytes
 */
export async function createLabels(
  req: any, // CreateLabelsRequest type
  ctx: AdapterContext
): Promise<CreateLabelsResponse> {
  try {
    // Import mappers and validators
    const { safeValidateCreateLabelsRequest } = await import('../validation/labels.js');
    const {
      mapCanonicalCreateLabelsToGLSPrintLabels,
      mapGLSPrintLabelsToCanonicalCreateLabels,
    } = await import('../mappers/labels.js');

    // Validate request
    const validated = safeValidateCreateLabelsRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error?.message}`,
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

    if (!Array.isArray(req.parcelCarrierIds) || req.parcelCarrierIds.length === 0) {
      return {
        results: [],
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        allSucceeded: false,
        allFailed: false,
        someFailed: false,
        summary: 'No parcel IDs provided',
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

    // Hash the password
    const hashedPassword = hashPasswordSHA512(credentials.password);

    // Get first client number
    const clientNumber = credentials.clientNumberList[0];

    // Map canonical request to GLS PrintLabels request
    const glsRequest = mapCanonicalCreateLabelsToGLSPrintLabels(
      req,
      clientNumber,
      credentials.username,
      hashedPassword,
      credentials.webshopEngine
    );

    const authHeaders = createGLSAuthHeader(credentials.username, hashedPassword);

    safeLog(
      ctx.logger,
      'debug',
      'GLS: Creating labels batch',
      {
        count: req.parcelCarrierIds.length,
        country,
        testMode: useTestApi,
      },
      ctx,
      ['createLabels']
    );

    // Call GLS PrintLabels endpoint (combines PrepareLabels + GetPrintedLabels)
    const httpResponse = await ctx.http.post(
      `${baseUrl}/PrintLabels`,
      glsRequest,
      { headers: authHeaders }
    );

    // Extract body from response
    const carrierRespBody = httpResponse.body as any;

    // Validate the response
    const { safeValidateGLSPrintLabelsResponse } = await import('../validation/labels.js');
    const responseValidation = safeValidateGLSPrintLabelsResponse(carrierRespBody);
    if (!responseValidation.success) {
      safeLog(
        ctx.logger,
        'warn',
        'GLS: Label response validation failed',
        {
          error: responseValidation.error?.message,
        },
        ctx,
        ['createLabels']
      );
      // Continue anyway - be lenient with response shape
    }

    if (!carrierRespBody) {
      throw new CarrierError('Invalid response from GLS', 'Transient', {
        raw: serializeForLog(httpResponse) as any,
      });
    }

    // Check for API-level errors
    if (carrierRespBody.printLabelsErrorList && carrierRespBody.printLabelsErrorList.length > 0) {
      const firstError = carrierRespBody.printLabelsErrorList[0];
      throw new CarrierError(
        `GLS API error: ${firstError.errorDescription} (code: ${firstError.errorCode})`,
        'Validation',
        {
          carrierCode: firstError.errorCode.toString(),
          raw: serializeForLog(firstError) as any,
        }
      );
    }

    // Map response to canonical format
    const response = mapGLSPrintLabelsToCanonicalCreateLabels(
      carrierRespBody,
      req.parcelCarrierIds.length
    );

    safeLog(
      ctx.logger,
      'info',
      'GLS: Labels creation finished',
      {
        count: response.results.length,
        testMode: useTestApi,
        summary: response.summary,
        successCount: response.successCount,
        failureCount: response.failureCount,
      },
      ctx,
      ['createLabels']
    );

    return response;
  } catch (error) {
    safeLog(
      ctx.logger,
      'error',
      'GLS: Error creating labels batch',
      {
        error: errorToLog(error),
      },
      ctx,
      ['createLabels']
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

/**
 * Track a parcel using GLS GetParcelStatuses endpoint
 * 
 * Capability: TRACK
 * 
 * Returns a timeline of tracking events for the parcel.
 * 
 * @param req Canonical tracking request
 * @param ctx Adapter context (logger, HTTP client)
 * @returns TrackingUpdate with events timeline
 * @throws CarrierError if authentication fails or API errors occur
 */

export async function track(
  req: TrackingRequest,
  ctx: AdapterContext
): Promise<TrackingUpdate> {
  try {
    // Validate canonical request
    const validationResult = safeValidateTrackingRequest(req);
    if (!validationResult.success) {
      throw new CarrierError(
        `Invalid tracking request: ${validationResult.error.message}`,
        'Permanent',
        { raw: validationResult.error }
      );
    }

    // For GLS, tracking number is the parcel number
    const parcelNumber = parseInt(req.trackingNumber, 10);
    if (Number.isNaN(parcelNumber) || parcelNumber <= 0) {
      throw new CarrierError(
        `Invalid parcel number: must be a positive integer, got "${req.trackingNumber}"`,
        'Permanent'
      );
    }

    // Validate and extract credentials
    if (!req.credentials) {
      throw new CarrierError(
        'GLS tracking requires credentials (username, password, clientNumberList)',
        'Permanent'
      );
    }

    // Type-cast credentials and validate
    const creds = req.credentials as Record<string, unknown>;
    try {
      validateGLSCredentials({
        username: creds.username as string,
        password: creds.password as string,
        clientNumberList: creds.clientNumberList as number[],
      });
    } catch (err) {
      throw new CarrierError(
        `Invalid GLS credentials: ${err instanceof Error ? err.message : String(err)}`,
        'Permanent'
      );
    }

    const useTestApi = req.options?.useTestApi || false;
    const baseUrl = resolveGLSBaseUrl('HU', useTestApi);  // Default to Hungary

    // Create auth header  
    const hashedPassword = hashPasswordSHA512(creds.password as string);
    const authHeaders = createGLSAuthHeader(creds.username as string, hashedPassword);

    // Get first client number (GLS requires one client number per request)
    const clientNumber = (creds.clientNumberList as number[])[0];

    safeLog(
      ctx.logger,
      'info',
      'GLS: Starting parcel tracking',
      {
        parcelNumber,
        clientNumber,
        testMode: useTestApi,
      },
      ctx,
      ['track']
    );

    // Call GLS GetParcelStatuses endpoint
    if (!ctx.http) {
      throw new CarrierError(
        'HTTP client not provided in context',
        'Permanent'
      );
    }

    const httpResponse = await ctx.http.post<any>(
      `${baseUrl}/GetParcelStatuses`,
      {
        parcelNumber,
        clientNumber,
        ...authHeaders,
      }
    );

    const carrierRespBody = httpResponse.body as any;

    // Validate GLS response
    const responseValidation = safeValidateGLSTrackingResponse(carrierRespBody);
    if (!responseValidation.success) {
      throw new CarrierError(
        `Invalid GLS tracking response: ${responseValidation.error.message}`,
        'Transient',
        { raw: responseValidation.error }
      );
    }

    // Check for errors in response
    if (carrierRespBody.getParcelStatusErrors && carrierRespBody.getParcelStatusErrors.length > 0) {
      const firstError = carrierRespBody.getParcelStatusErrors[0];
      throw new CarrierError(
        `GLS API error: ${firstError.errorDescription} (code: ${firstError.errorCode})`,
        firstError.errorCode === '01' ? 'Permanent' : 'Transient', // 01 = Auth error
        {
          carrierCode: firstError.errorCode.toString(),
          raw: serializeForLog(firstError) as any,
        }
      );
    }

    // Map response to canonical format
    const trackingUpdate = mapGLSTrackingResponseToCanonical(carrierRespBody);

    safeLog(
      ctx.logger,
      'info',
      'GLS: Parcel tracking finished',
      {
        parcelNumber,
        status: trackingUpdate.status,
        eventCount: trackingUpdate.events.length,
        testMode: useTestApi,
      },
      ctx,
      ['track']
    );

    return trackingUpdate;
  } catch (error) {
    safeLog(
      ctx.logger,
      'error',
      'GLS: Error tracking parcel',
      {
        error: errorToLog(error),
      },
      ctx,
      ['track']
    );

    if (error instanceof CarrierError) {
      throw error;
    }

    // Translate HTTP errors
    if ((error as any).response?.status === 401 || (error as any).response?.status === 403) {
      throw new CarrierError('GLS authentication failed', 'Permanent', { raw: error });
    }

    if ((error as any).response?.status === 404) {
      throw new CarrierError('Parcel not found', 'Permanent', { raw: error });
    }

    if ((error as any).response?.status === 500 || (error as any).response?.status === 503) {
      throw new CarrierError(
        'GLS API temporarily unavailable',
        'Transient',
        { raw: error }
      );
    }

    throw new CarrierError(
      `GLS tracking error: ${error instanceof Error ? error.message : String(error)}`,
      'Transient',
      { raw: error }
    );
  }
}
