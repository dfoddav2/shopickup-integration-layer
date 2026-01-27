/**
 * MPL Tracking Implementation
 * 
 * Implements the TRACK capability using MPL's Pull-1 endpoints:
 * - /v2/nyomkovetes/guest - Guest endpoint (public, no financial data)
 * - /v2/nyomkovetes/registered - Registered endpoint (authenticated, includes financial data)
 * 
 * Both endpoints return C-code tracking records that are normalized to canonical TrackingUpdate format.
 */

import type { AdapterContext, TrackingUpdate } from '@shopickup/core';
import { CarrierError, serializeForLog } from '@shopickup/core';
import {
  safeValidateTrackingRequest,
  safeValidateTrackingResponse,
  type TrackingRequestMPL,
} from '../validation.js';
import {
  mapMPLTrackingToCanonical,
} from '../mappers/tracking.js';
import { buildMPLHeaders } from '../utils/httpUtils.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';

/**
 * Track one or more parcels using the Pull-1 endpoint
 * 
 * @param request - Tracking request with tracking numbers and credentials
 * @param ctx - Adapter context with HTTP client
 * @param resolveBaseUrl - Function to resolve API base URL
 * @returns Array of TrackingUpdate objects (one per tracking number)
 * @throws CarrierError for various error scenarios
 */
export async function track(
  request: TrackingRequestMPL,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl
): Promise<TrackingUpdate[]> {
  // Validate request
  const validation = safeValidateTrackingRequest(request);
  if (!validation.success) {
    throw new CarrierError(
      `Invalid tracking request: ${validation.error.message}`,
      'Validation',
      { raw: serializeForLog(validation.error) as any }
    );
  }

  if (!ctx.http) {
    throw new CarrierError(
      'HTTP client not provided in context',
      'Permanent'
    );
  }

  const validRequest = validation.data;

  // Determine endpoint (guest vs registered)
  const isRegistered = validRequest.useRegisteredEndpoint ?? false;
  const endpoint = isRegistered ? '/nyomkovetes/registered' : '/nyomkovetes/guest';
  
  // Build request payload
  // MPL API requires:
  // - ids: comma-separated string of tracking numbers
  // - state: 'last' or 'all'
  // - language: 'hu' (hardcoded for Hungarian, native carrier language)
  const idsParam = validRequest.trackingNumbers.join(',');
  const stateParam = validRequest.state ?? 'last';
  
  // Extract accountingCode from credentials
  const accountingCode = (validRequest.credentials as any)?.accountingCode;
  
  // Resolve base URL
  const baseUrl = resolveBaseUrl(validRequest.options);
  const isTestApi = validRequest.options?.useTestApi ?? false;

  ctx.logger?.debug('MPL: Tracking parcels', {
    endpoint,
    trackingNumbers: validRequest.trackingNumbers,
    state: stateParam,
    testMode: isTestApi,
    registered: isRegistered,
  });

  // Build URL with query parameters
  const url = new URL(endpoint, baseUrl);
  url.searchParams.set('ids', idsParam);
  url.searchParams.set('state', stateParam);
  url.searchParams.set('language', 'hu');

  // Build authentication headers
  const headers = buildMPLHeaders(validRequest.credentials, accountingCode);

  // Make request
  let httpResponse: any;
  try {
    httpResponse = await ctx.http.get(url.toString(), { headers });
  } catch (error) {
    throw translateTrackingError(error, idsParam);
  }

  // Extract body from normalized HttpResponse
  const responseData = httpResponse.body as any;

  // Validate response
  const responseValidation = safeValidateTrackingResponse(responseData);
  if (!responseValidation.success) {
    throw new CarrierError(
      `Invalid tracking response: ${responseValidation.error.message}`,
      'Transient',
      { raw: serializeForLog(responseValidation.error) as any }
    );
  }

  const validResponse = responseValidation.data;

  // Check for empty response (tracking not found)
  const records = validResponse.trackAndTrace;
  if (!records || records.length === 0) {
    throw new CarrierError(
      `No tracking information found for: ${idsParam}`,
      'Validation'
    );
  }

  // Convert records to canonical format
  // If state='all', each record is a separate event in history
  // If state='last', each record is just the latest event
  const trackingUpdates: TrackingUpdate[] = records.map((record: any, index: number) => {
    try {
      // For 'all' state, this would be more complex (multiple records per tracking number)
      // For now, assume one record per tracking number
      return mapMPLTrackingToCanonical(record, isRegistered);
    } catch (error) {
      throw new CarrierError(
        `Failed to map tracking record ${index}: ${error instanceof Error ? error.message : String(error)}`,
        'Transient',
        { raw: record }
      );
    }
  });

  ctx.logger?.info('MPL: Tracking completed', {
    found: trackingUpdates.length,
    requested: validRequest.trackingNumbers.length,
  });

  return trackingUpdates;
}

/**
 * Translate MPL tracking errors to CarrierError
 * 
 * @param error - Original error from HTTP client
 * @param trackingIds - Tracking numbers being queried (for context)
 * @returns CarrierError with appropriate category
 */
function translateTrackingError(
  error: unknown,
  trackingIds: string
): CarrierError {
  // Check if it's an axios or fetch error
  if (error && typeof error === 'object') {
    const err = error as any;

    // Handle HTTP status codes
    if (typeof err.status === 'number' || typeof err.response?.status === 'number') {
      const status = err.status ?? err.response?.status;
      const statusText = err.statusText ?? err.response?.statusText ?? '';
      const data = err.data ?? err.response?.data ?? {};

      if (status === 400) {
        // Bad request - validation error
        return new CarrierError(
          `Bad request (400): ${statusText || getErrorMessage(data)}`,
          'Validation'
        );
      } else if (status === 401 || status === 403) {
        // Authentication/authorization error
        return new CarrierError(
          `${status === 401 ? 'Unauthorized (401)' : 'Forbidden (403)'}: Invalid credentials`,
          'Auth'
        );
      } else if (status === 404) {
        // Not found
        return new CarrierError(
          `Not found (404): Tracking information not available`,
          'Validation'
        );
      } else if (status === 429) {
        // Rate limited
        const retryAfter = err.headers?.['retry-after'] ?? err.response?.headers?.['retry-after'];
        const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
        return new CarrierError(
          `Rate limited (429): Too many requests`,
          'RateLimit',
          { retryAfterMs }
        );
      } else if (status >= 500) {
        // Server error - transient
        return new CarrierError(
          `Server error (${status}): ${statusText}`,
          'Transient'
        );
      }
    }

    // Network/timeout errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return new CarrierError(
        `Network error: ${err.message}`,
        'Transient'
      );
    }
  }

  // Generic error
  return new CarrierError(
    `Tracking error: ${error instanceof Error ? error.message : String(error)}`,
    'Transient'
  );
}

/**
 * Extract error message from MPL API error response
 */
function getErrorMessage(data: any): string {
  if (data && typeof data === 'object') {
    // Check for gateway error format
    if (data.fault?.faultstring) {
      return data.fault.faultstring;
    }
    // Check for other error formats
    if (data.message) {
      return data.message;
    }
    if (data.error) {
      return typeof data.error === 'string' ? data.error : data.error.message || 'Unknown error';
    }
  }
  return 'Unknown error';
}

