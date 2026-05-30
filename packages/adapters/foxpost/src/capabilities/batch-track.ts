/**
 * Foxpost Adapter: Batch Track Capability
 * Handles BATCH_TRACK operation
 * 
 * Foxpost endpoint: POST /api/tracking/tracks
 * Body: array of barcodes
 * Response: array of Statuses objects
 */

import type {
  AdapterContext,
  BatchTrackingRequest,
  BatchTrackingResponse,
  BatchTrackingResult,
} from "@shopickup/core";
import { CarrierError, errorToLog, serializeForLog } from "@shopickup/core";
import { mapFoxpostTrackToCanonical } from '../mappers/index.js';
import { translateFoxpostError, sanitizeResponseForLog } from '../errors.js';
import { buildFoxpostHeaders } from '../utils/httpUtils.js';
import type { ResolveBaseUrl } from '../utils/resolveBaseUrl.js';
import {
  safeValidateBatchTrackingRequest,
  safeValidateFoxpostApiError,
} from '../validation.js';

/**
 * Track multiple parcels in a single batch call.
 * 
 * @param req BatchTrackingRequest with array of trackingNumbers
 * @param ctx Adapter context with HTTP client
 * @param resolveBaseUrl Base URL resolver for test/production selection
 * @returns BatchTrackingResponse with per-item results and summary
 */
export async function batchTrack(
  req: BatchTrackingRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<BatchTrackingResponse> {
  try {
    const validated = safeValidateBatchTrackingRequest(req);
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

    const trackingNumbers = validated.data.trackingNumbers;
    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return {
        results: [],
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        allSucceeded: false,
        allFailed: false,
        someFailed: false,
        summary: "No tracking numbers to process",
      };
    }

    const useTestApi = validated.data.options?.useTestApi ?? false;
    const baseUrl = resolveBaseUrl({ useTestApi });

    ctx.logger?.debug("Foxpost: Batch tracking parcels", {
      count: trackingNumbers.length,
      testMode: useTestApi,
    });

    const httpResponse = await ctx.http.post(
      `${baseUrl}/api/tracking/tracks`,
      trackingNumbers,
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

    // Map each Statuses item to BatchTrackingResult
    const results: BatchTrackingResult[] = carrierRespBody.map((item: any) => {
      const barcode = item.barcode;

      if (!barcode) {
        return {
          trackingNumber: 'unknown',
          status: 'failed' as const,
          error: {
            code: 'MISSING_BARCODE',
            message: 'Response item missing barcode',
          },
          raw: item,
        };
      }

      const statuses = item.statuses;
      if (!Array.isArray(statuses) || statuses.length === 0) {
        return {
          trackingNumber: barcode,
          status: 'not_found' as const,
          raw: item,
        };
      }

      // Map TrackDTOs to TrackingEvents (chronological order)
      const events = statuses
        .map((track: any) => mapFoxpostTrackToCanonical({
          trackId: track.trackId,
          status: track.status,
          statusDate: track.statusDate,
        }))
        .reverse(); // Reverse to chronological order

      const latestEvent = events[events.length - 1];

      return {
        trackingNumber: barcode,
        status: 'found' as const,
        update: {
          trackingNumber: barcode,
          events,
          status: latestEvent.status,
          lastUpdate: latestEvent.timestamp,
          rawCarrierResponse: item,
        },
        raw: item,
      };
    });

    const successCount = results.filter((r) => r.status === 'found').length;
    const failureCount = results.filter((r) => r.status === 'failed').length;
    const totalCount = results.length;

    let summary: string;
    if (failureCount === 0) {
      summary = `All ${totalCount} parcels tracked successfully`;
    } else if (successCount === 0) {
      summary = `All ${totalCount} parcels failed tracking`;
    } else {
      summary = `Mixed results: ${successCount} tracked, ${failureCount} failed`;
    }

    ctx.logger?.info("Foxpost: Batch tracking finished", {
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
    ctx.logger?.error("Foxpost: Error batch tracking parcels", {
      error: errorToLog(error),
    });

    if (error instanceof CarrierError) {
      throw error;
    }

    throw translateFoxpostError(error);
  }
}
