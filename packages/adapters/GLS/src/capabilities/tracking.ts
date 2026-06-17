/**
 * GLS Tracking Capability
 * 
 * Tracks a parcel using GLS GetParcelStatuses endpoint
 * 
 * Capability: TRACK
 * 
 * Returns a timeline of tracking events for the parcel.
 */

import type {
  TrackingRequest,
  TrackingUpdate,
  AdapterContext,
} from '@shopickup/core';
import {
  CarrierError,
  safeLog,
  serializeForLog,
  errorToLog,
} from '@shopickup/core';
import {
  mapGLSTrackingResponseToCanonical,
} from '../mappers/tracking.js';
import {
  hashPasswordSHA512,
  resolveGLSBaseUrl,
  convertToPascalCase,
  convertFromPascalCase,
} from '../utils/authentication.js';
import {
  safeValidateTrackingRequest,
  safeValidateGLSTrackingResponse,
} from '../validation/tracking.js';

/**
 * Track a parcel using GLS GetParcelStatuses endpoint
 * 
 * @param req Canonical tracking request (internally validated against narrowed GLS schema)
 * @param ctx Adapter context (logger, HTTP client)
 * @returns TrackingUpdate with events timeline
 * @throws CarrierError if authentication fails or API errors occur
 */
export async function track(
  req: TrackingRequest,
  ctx: AdapterContext
): Promise<TrackingUpdate> {
  try {
    // Single-step validation against narrowed GLSTrackingRequestSchema
    const validationResult = safeValidateTrackingRequest(req);
    if (!validationResult.success) {
      throw new CarrierError(
        `Invalid tracking request: ${validationResult.error.message}`,
        'Permanent',
        { raw: validationResult.error }
      );
    }

    const data = validationResult.data;

    // For GLS, tracking number is the parcel number
    const parcelNumber = parseInt(data.trackingNumber, 10);
    if (Number.isNaN(parcelNumber) || parcelNumber <= 0) {
      throw new CarrierError(
        `Invalid parcel number: must be a positive integer, got "${data.trackingNumber}"`,
        'Permanent'
      );
    }

    const credentials = data.credentials;
    const options = data.options;
    const useTestApi = options?.useTestApi || false;
    const country = options?.country || 'HU';
    const returnPOD = options?.returnPOD || false;
    const languageIsoCode = options?.languageIsoCode || 'EN';
    const baseUrl = resolveGLSBaseUrl(country, useTestApi);

    // Hash password for authentication (as byte array)
    const hashedPassword = hashPasswordSHA512(credentials.password);

    // Get first client number for request context
    const clientNumber = credentials.clientNumberList[0];

    safeLog(
      ctx.logger,
      'info',
      'GLS: Starting parcel tracking',
      { parcelNumber, clientNumber, country, testMode: useTestApi },
      ctx,
      ['track']
    );

    if (!ctx.http) {
      throw new CarrierError(
        'HTTP client not provided in context',
        'Permanent'
      );
    }

    const trackingRequestCamelCase = {
      username: credentials.username,
      password: hashedPassword,
      parcelNumber,
      clientNumber,
      returnPOD,
      languageIsoCode,
    };

    const trackingRequest = convertToPascalCase(trackingRequestCamelCase);

    safeLog(
      ctx.logger,
      'debug',
      'GLS: Tracking request',
      {
        url: `${baseUrl}/json/GetParcelStatuses`,
        requestKeys: Object.keys(trackingRequest),
        hasPassword: Array.isArray(trackingRequest.Password),
        parcelNumber: trackingRequest.ParcelNumber,
        returnPOD: trackingRequest.ReturnPOD,
        languageCode: trackingRequest.LanguageIsoCode,
      },
      ctx,
      ['track', 'debug']
    );

    const httpResponse = await ctx.http.post<any>(
      `${baseUrl}/json/GetParcelStatuses`,
      trackingRequest
    );

    safeLog(
      ctx.logger,
      'debug',
      'GLS: Tracking response received',
      {
        statusCode: (httpResponse as any).statusCode || 'unknown',
        hasBody: !!httpResponse.body,
      },
      ctx,
      ['track', 'debug']
    );

    const carrierRespBody = httpResponse.body as any;

    // Convert GLS API response from PascalCase to camelCase
    const normalizedResponse = convertFromPascalCase(carrierRespBody) as any;

    // Validate GLS response
    const responseValidation = safeValidateGLSTrackingResponse(normalizedResponse);
    if (!responseValidation.success) {
      throw new CarrierError(
        `Invalid GLS tracking response: ${responseValidation.error.message}`,
        'Transient',
        { raw: { ...responseValidation.error, rawCarrierResponse: carrierRespBody } }
      );
    }

    // Check for errors in response
    const trackingErrorList = normalizedResponse.getParcelStatusErrors as any[];
    if (trackingErrorList && trackingErrorList.length > 0) {
      const firstError = trackingErrorList[0];
      const errorCode = firstError.errorCode;
      const errorDescription = firstError.errorDescription;

      let category: 'Auth' | 'NotFound' | 'Validation' | 'Permanent' | 'Transient' = 'Transient';
      if (errorCode === -1) {
        category = 'Auth';
      } else if (errorCode === 4 || errorCode === 9 || errorCode === 26) {
        category = 'NotFound';
      } else if (errorCode === '01' || errorCode === 14 || errorCode === 15 || errorCode === 27) {
        category = 'Permanent';
      }

      throw new CarrierError(
        `GLS API error: ${errorDescription} (code: ${errorCode})`,
        category,
        {
          carrierCode: errorCode.toString(),
          raw: { error: serializeForLog(firstError), rawCarrierResponse: carrierRespBody },
        }
      );
    }

    // Map response to canonical format (rawCarrierResponse keeps typed normalized data)
    const trackingUpdate = mapGLSTrackingResponseToCanonical(normalizedResponse);

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
      { error: errorToLog(error) },
      ctx,
      ['track']
    );

    if (error instanceof CarrierError) {
      throw error;
    }

    if ((error as any).response?.status === 401 || (error as any).response?.status === 403) {
      throw new CarrierError('GLS authentication failed', 'Auth', { raw: error });
    }

    if ((error as any).response?.status === 404) {
      throw new CarrierError('Parcel not found', 'NotFound', { raw: error });
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
