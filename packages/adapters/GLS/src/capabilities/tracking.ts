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
  createGLSAuthHeader,
  resolveGLSBaseUrl,
  validateGLSCredentials,
} from '../utils/authentication.js';
import {
  safeValidateTrackingRequest,
  safeValidateGLSTrackingResponse,
} from '../validation/tracking.js';

/**
 * Track a parcel using GLS GetParcelStatuses endpoint
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

    // Build request body with auth at root level (per GLS API spec)
    const trackingRequest = {
      username: creds.username as string,
      password: hashedPassword,
      clientNumberList: creds.clientNumberList as number[],
      parcelNumber,
      clientNumber,
    };

    const httpResponse = await ctx.http.post<any>(
      `${baseUrl}/json/GetParcelStatuses`,
      trackingRequest,
      { headers: authHeaders }
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
    // GLS API returns both getParcelStatusErrors and GetParcelStatusErrors (case varies)
    const trackingErrorList = (carrierRespBody.getParcelStatusErrors || (carrierRespBody as any).GetParcelStatusErrors) as any[];
    if (trackingErrorList && trackingErrorList.length > 0) {
      const firstError = trackingErrorList[0];
      const errorCode = firstError.errorCode || firstError.ErrorCode;
      const errorDescription = firstError.errorDescription || firstError.ErrorDescription;
      
      // Determine error category based on error code
      let category: 'Auth' | 'Validation' | 'Permanent' | 'Transient' = 'Transient';
      if (errorCode === -1) {
        category = 'Auth';
      } else if (errorCode === '01' || errorCode === 14 || errorCode === 15 || errorCode === 27) {
        category = 'Auth';
      } else if (errorCode === 4 || errorCode === 9) {
        // Parcel not found
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
