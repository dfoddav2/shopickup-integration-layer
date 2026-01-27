/**
 * MPL Pickup Points Capability
 * 
 * Fetches and normalizes the list of delivery places and pickup points
 * from the MPL API endpoint `/deliveryplace`.
 * 
 * Supports filtering by postCode, city, or servicePointType.
 * Returns normalized PickupPoint entries in canonical format.
 */

import type {
  FetchPickupPointsRequest,
  FetchPickupPointsResponse,
  PickupPoint,
  AdapterContext,
} from "@shopickup/core";
import { CarrierError, safeLog, createLogEntry, serializeForLog } from "@shopickup/core";
import type { ResolveBaseUrl } from "../utils/resolveBaseUrl.js";
import type { HttpResponse } from "@shopickup/core";
import {
  safeValidateFetchPickupPointsRequest,
  isGatewayError,
  isSuccessResponse,
  type MPLPickupPointResponse,
  type MPLPickupPointResponse200,
  type MPLPickupPointEntry,
  type MPLAPIGatewayErrorResponse,
} from "../validation.js";
import { buildMPLHeaders } from "../utils/httpUtils.js";

/**
 * MPL-specific metadata for pickup points
 * Derived from MPLPickupPointEntry to include only carrier-specific fields relevant to the canonical PickupPoint
 * Includes deliveryplace name and any validation errors from the entry
 */
type MPLPickupPointMetadata = Pick<
  MPLPickupPointEntry['deliveryplacesQueryResult'],
  'deliveryplace' | 'errors'
>;

/**
 * Maps an MPL delivery place entry to canonical PickupPoint
 * 
 * Handles:
 * - Coordinate parsing from geocodeLat/geocodeLong (may be numbers)
 * - Address construction from address field
 * - Service point type validation
 * - Metadata preservation for carrier-specific fields
 */
function mapMplDeliveryPlaceToPickupPoint(entry: MPLPickupPointEntry): PickupPoint {
  const qr = entry.deliveryplacesQueryResult;
  
  // Use the delivery place ID as primary identifier
  const id = qr.id || `mpl-${Math.random().toString(36).slice(2, 9)}`;

  // Parse coordinates - geocodeLat and geocodeLong are numbers
  let latitude: number | undefined;
  let longitude: number | undefined;

  if (qr.geocodeLat !== undefined && qr.geocodeLat !== null) {
    latitude = typeof qr.geocodeLat === 'string' ? parseFloat(qr.geocodeLat) : qr.geocodeLat;
    latitude = isNaN(latitude) ? undefined : latitude;
  }

  if (qr.geocodeLong !== undefined && qr.geocodeLong !== null) {
    longitude = typeof qr.geocodeLong === 'string' ? parseFloat(qr.geocodeLong) : qr.geocodeLong;
    longitude = isNaN(longitude) ? undefined : longitude;
  }

  // Determine allowed services based on servicePointType
  // For MPL, servicePointType indicates what types of operations are allowed at this point
  // These are the pickup-capable service point types available in the request filter
  let pickupAllowed = true;  // Most delivery places support pickup
  let dropoffAllowed = true; // Most delivery places support dropoff

  const types = entry.servicePointType || [];
  
  // ServicePointType options include:
  // 'PM' - Postán Maradó (Post Office) - typically both
  // 'PP' - PostaPont (Post Point) - typically both
  // 'CS' - Csomagautomata (Parcel Locker) - typically both pickup and dropoff
  // Note: 'HA' and 'RA' are not in the pickup filter list but may appear in responses
  
  // If no pickup-enabled service types are present, restrict to dropoff only
  const pickupEnabledTypes = types.filter(t => t === 'PM' || t === 'PP' || t === 'CS');
  if (types.length > 0 && pickupEnabledTypes.length === 0) {
    pickupAllowed = false;
  }

  // Collect carrier-specific metadata
  const metadata: MPLPickupPointMetadata = {
    deliveryplace: qr.deliveryplace,
    errors: qr.errors && qr.errors.length > 0 ? qr.errors : null,
  };

  // Clean metadata - remove undefined keys
  const cleanedMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  ) as MPLPickupPointMetadata;

  return {
    id,
    name: qr.deliveryplace,
    country: 'hu', // MPL is Hungary-based
    postalCode: qr.postCode,
    city: qr.city,
    address: qr.address,
    latitude,
    longitude,
    dropoffAllowed,
    pickupAllowed,
    metadata: Object.keys(cleanedMetadata).length > 0 ? cleanedMetadata : undefined,
    raw: entry,
  };
}

/**
 * Translates an MPL gateway error to a CarrierError with appropriate category and details
 * 
 * Categorizes errors based on HTTP status and error details:
 * - 400/404: Validation errors (Permanent - don't retry)
 * - 401/403: Auth errors (Auth - don't retry, check credentials)
 * - 429: Rate limit (RateLimit - retry with backoff)
 * - 500/503: Server errors (Transient - retry)
 */
function translateMplError(
  error: MPLAPIGatewayErrorResponse,
  httpStatus: number,
  headers: Record<string, string | string[] | undefined>
): CarrierError {
  const faultString = error.fault?.faultstring || 'Unknown error';
  const errorCode = error.fault?.detail?.errorcode || 'UNKNOWN';

  let category: 'Validation' | 'Auth' | 'Transient' | 'RateLimit' | 'Permanent';
  const details: Record<string, unknown> = {
    mplErrorCode: errorCode,
    mplFaultString: faultString,
    raw: error,
  };

  if (httpStatus === 400 || httpStatus === 404) {
    category = 'Validation';
  } else if (httpStatus === 401) {
    category = 'Auth';
  } else if (httpStatus === 403) {
    category = 'Auth';
  } else if (httpStatus === 429) {
    category = 'RateLimit';
    // Extract quota information from headers
    const retryAfter = headers['retry-after'];
    if (retryAfter) {
      const retryAfterMs = parseInt(String(retryAfter)) * 1000;
      details.retryAfterMs = retryAfterMs;
    }
    // Include quota headers if available
    if (headers['x-quota-reset']) details.quotaReset = headers['x-quota-reset'];
    if (headers['x-quota-allowed']) details.quotaAllowed = headers['x-quota-allowed'];
    if (headers['x-quota-available']) details.quotaAvailable = headers['x-quota-available'];
  } else if (httpStatus >= 500) {
    category = 'Transient';
  } else {
    category = 'Transient'; // Default to transient for unknown statuses
  }

  return new CarrierError(
    `MPL API error: ${faultString} (${errorCode})`,
    category,
    details
  );
}

/**
 * Fetch pickup points from MPL API
 * 
 * Makes an authenticated request to the `/deliveryplace` endpoint with optional filters.
 * 
 * Handles both success and error responses:
 * - 200 OK: Returns normalized PickupPoint array
 * - 4xx/5xx: Translates to CarrierError with appropriate retry category
 * 
 * Note on logging: By default, raw responses are logged as summaries only
 * to avoid polluting logs with hundreds of pickup point entries.
 * To customize logging behavior, pass loggingOptions in the adapter context:
 * {
 *   loggingOptions: {
 *     logRawResponse: true,        // Log full response
 *     logRawResponse: false,       // Skip logging raw entirely
 *     logRawResponse: 'summary',   // Log only summary (default)
 *     maxArrayItems: 50,           // Increase items shown in arrays
 *     silentOperations: []         // Enable logging for this operation
 *   }
 * }
 * 
 * @param req Request containing credentials and optional filters (postCode, city, servicePointType)
 * @param ctx Adapter context with HTTP client and logger
 * @param resolveBaseUrl Function to resolve API base URL (test vs. production)
 * @returns FetchPickupPointsResponse with normalized pickup points
 * @throws CarrierError on HTTP error or response parsing failure
 */
export async function fetchPickupPoints(
  req: FetchPickupPointsRequest,
  ctx: AdapterContext,
  resolveBaseUrl: ResolveBaseUrl,
): Promise<FetchPickupPointsResponse> {
  if (!ctx.http) {
    throw new CarrierError(
      "HTTP client not provided in adapter context",
      "Permanent",
      { raw: "Missing ctx.http" }
    );
  }

  try {
    // Validate request format and credentials
    const validated = safeValidateFetchPickupPointsRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error.message}`,
        "Validation",
        { raw: serializeForLog(validated.error) as unknown }
      );
    }

    // Extract details from validated request
    const useTestApi = validated.data.options?.useTestApi ?? false;
    const postCode = validated.data.postCode || "";
    const city = validated.data.city || "";
    const servicePointType = validated.data.servicePointType || [];
    const filters = { postCode, city, servicePointType };
    const credentialType = validated.data.credentials.authType;
    const baseUrl = resolveBaseUrl(validated.data.options);

    // Log the fetch attempt
    safeLog(
      ctx.logger,
      'debug',
      'Fetching MPL pickup points with filters',
      createLogEntry(
        { useTestApi, filters, credentialType, endpoint: '/deliveryplace' },
        null,
        ctx,
        ['fetchPickupPoints']
      ),
      ctx,
      ['fetchPickupPoints']
    );

    // Make the API request
    const httpResponse = await ctx.http.post<MPLPickupPointResponse>(
      `${baseUrl}/deliveryplace`,
      {
        deliveryPlacesQuery: {
          postCode,
          city,
        },
        servicePointType,
      },
      {
        headers: buildMPLHeaders(validated.data.credentials, validated.data.accountingCode),
      }
    );

    // Handle non-200 responses (gateway errors)
    if (httpResponse.status !== 200) {
      const body = httpResponse.body;
      
      if (isGatewayError(body)) {
        const translatedError = translateMplError(body, httpResponse.status, httpResponse.headers);
        ctx.logger?.warn("MPL API error response", {
          status: httpResponse.status,
          error: translatedError.message,
          category: translatedError.category,
        });
        throw translatedError;
      } else {
        // Unexpected response format for error status
        throw new CarrierError(
          `MPL API returned status ${httpResponse.status} with unexpected response format`,
          "Transient",
          { raw: body }
        );
      }
    }

    // Validate 200 response structure
    const body = httpResponse.body;
    if (!isSuccessResponse(body)) {
      throw new CarrierError(
        "Invalid response format from MPL API: expected {deliveryplaces: Array}",
        "Permanent",
        { raw: body }
      );
    }

    // Extract delivery places array
    const apmData = body.deliveryplaces;
    if (!Array.isArray(apmData)) {
      throw new CarrierError(
        "Invalid response format: deliveryplaces is not an array",
        "Permanent",
        { raw: body }
      );
    }

    safeLog(
      ctx.logger,
      'debug',
      'MPL API response received',
      createLogEntry(
        { count: apmData.length, filters },
        apmData,
        ctx,
        ['fetchPickupPoints']
      ),
      ctx,
      ['fetchPickupPoints']
    );

    // Map each delivery place to canonical PickupPoint
    const points: PickupPoint[] = apmData
      .map((entry: MPLPickupPointEntry) => {
        try {
          return mapMplDeliveryPlaceToPickupPoint(entry);
        } catch (err) {
          ctx.logger?.warn("Failed to map delivery place entry", {
            id: entry.deliveryplacesQueryResult?.id,
            error: String(err),
          });
          // Skip entries that can't be mapped
          return null;
        }
      })
      .filter((p: PickupPoint | null): p is PickupPoint => p !== null);

    safeLog(
      ctx.logger,
      'info',
      'Successfully fetched and mapped MPL pickup points',
      {
        count: points.length,
        succeeded: points.length,
        failed: apmData.length - points.length,
        filters,
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
      rawCarrierResponse: apmData,
    };
  } catch (err) {
    // Handle caught CarrierErrors
    if (err instanceof CarrierError) {
      throw err;
    }

    // Convert unknown errors to CarrierError
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger?.error("Failed to fetch MPL pickup points", {
      error: errorMessage,
      type: err instanceof Error ? err.constructor.name : typeof err,
    });

    // Determine error category based on error type
    let category: 'Validation' | 'Transient' | 'Permanent' = 'Transient';
    
    if (err instanceof Error && err.message.includes('Invalid response format')) {
      category = 'Permanent';
    }

    throw new CarrierError(
      `Failed to fetch MPL pickup points: ${errorMessage}`,
      category,
      { raw: err }
    );
  }
}
