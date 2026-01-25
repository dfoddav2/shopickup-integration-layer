/**
 * Foxpost Adapter: Parcel Tracking Capability
 * Handles TRACK operation
 */

import type {
  AdapterContext,
  TrackingRequest,
  TrackingUpdate,
} from "@shopickup/core";
import { CarrierError, serializeForLog, errorToLog } from "@shopickup/core";
import {
  mapFoxpostTraceToCanonical,
} from '../mappers/index.js';
import { translateFoxpostError, sanitizeResponseForLog } from '../errors.js';
import { safeValidateTrackingRequest, safeValidateFoxpostTracking } from '../validation.js';
import { buildFoxpostHeaders } from '../utils/httpUtils.js';
import type { TrackingResponse } from '../types/generated.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';

/**
 * Track a parcel by its clFoxId or uniqueBarcode using the GET /api/tracking/{barcode} endpoint
 * 
 * Returns normalized tracking information with all available traces in reverse chronological order
 * 
 * To use test API, pass in request as:
 * { trackingNumber: barcode, credentials: {...}, options?: { useTestApi: true } }
 */
export async function track(
  req: TrackingRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<TrackingUpdate> {
  try {
    // Validate request format and credentials
    const validated = safeValidateTrackingRequest(req);
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

    // Extract useTestApi from validated request (per-call test mode selection)
    const useTestApi = validated.data.options?.useTestApi ?? false;
    const baseUrl = resolveBaseUrl(validated.data.options);

    // Extract strongly-typed credentials from validated request
    const trackingNumber = validated.data.trackingNumber;
    const { apiKey, basicUsername, basicPassword } = validated.data.credentials;

    ctx.logger?.debug("Foxpost: Tracking parcel", {
      trackingNumber,
      testMode: useTestApi,
    });

    // Get tracking history via /api/tracking/{barcode} endpoint with proper typing
    const url = `${baseUrl}/api/tracking/${trackingNumber}`;
    const httpResponse = await ctx.http.get<TrackingResponse>(url, {
      headers: buildFoxpostHeaders(validated.data.credentials),
    });

    // Extract body from normalized HttpResponse
    const response = httpResponse.body;

    // Validate response against Zod schema
    const responseValidation = safeValidateFoxpostTracking(response);
    if (!responseValidation.success) {
      throw new CarrierError(
        `Invalid tracking response: ${responseValidation.error.message}`,
        "Validation",
        { raw: serializeForLog(responseValidation.error) as any }
      );
    }

    const validatedResponse = responseValidation.data;

    // Validate clFox is present
    if (!validatedResponse.clFox) {
      throw new CarrierError(
        `No tracking information found for ${trackingNumber}`,
        "Validation"
      );
    }

    // Validate traces array exists
    if (!Array.isArray(validatedResponse.traces)) {
      throw new CarrierError(
        `Invalid tracking response: traces array missing for ${trackingNumber}`,
        "Transient",
        { raw: serializeForLog(validatedResponse) as any }
      );
    }

    // Convert Foxpost traces to canonical TrackingEvents
    // Traces arrive in reverse chronological order (latest first), but we want them chronological for the response
    const events = validatedResponse.traces
      .map(mapFoxpostTraceToCanonical)
      .reverse(); // Reverse to get chronological order

    // Current status is from the latest trace (which is first in the API response)
    const currentStatus = validatedResponse.traces.length > 0
      ? mapFoxpostTraceToCanonical(validatedResponse.traces[0]).status
      : "PENDING";

    ctx.logger?.info("Foxpost: Tracking retrieved", {
      trackingNumber,
      clFox: validatedResponse.clFox,
      status: currentStatus,
      events: events.length,
      parcelType: validatedResponse.parcelType,
      sendType: validatedResponse.sendType,
      testMode: useTestApi,
    });

    return {
      trackingNumber,
      events,
      status: currentStatus,
      lastUpdate: events.length > 0 ? events[events.length - 1].timestamp : null,
      rawCarrierResponse: validatedResponse,
    };
  } catch (error) {
    if (error instanceof CarrierError) {
      throw error;
    }
    ctx.logger?.error("Foxpost: Error tracking parcel", {
      trackingNumber: req.trackingNumber,
      error: errorToLog(error),
    });
    throw translateFoxpostError(error);
  }
}
