/**
 * MPL Detailed Pickup Points Capability (PartnerExtra)
 *
 * Fetches and normalizes the full list of post offices, posta partners, and
 * pickup points from the public PartnerExtra XML feed.
 *
 * Endpoint: https://httpmegosztas.posta.hu/PartnerExtra/Out/PostInfo.xml
 * API description: https://www.posta.hu/partnerextra
 *
 * Unlike the authenticated /deliveryplace endpoint, PartnerExtra:
 * - requires no credentials (public feed)
 * - has no test/sandbox variant
 * - returns richer metadata (working hours, GPS, phone, email, service point type)
 */

import type {
  FetchPickupPointsRequest,
  FetchPickupPointsResponse,
  PickupPoint,
  AdapterContext,
} from "@shopickup/core";
import { CarrierError, safeLog, createLogEntry, serializeForLog } from "@shopickup/core";
import type { PartnerExtraPost, PartnerExtraWorkingHoursDay } from "../validation.js";
import {
  safeValidateFetchDetailedPickupPointsRequest,
} from "../validation.js";
import {
  parsePartnerExtraPostInfo,
  extractPartnerExtraPosts,
  extractPartnerExtraWorkingHoursDays,
  normalizePartnerExtraWorkingHours,
  parseHungarianDecimal,
} from "../utils/partnerExtraXml.js";

/**
 * PartnerExtra production endpoint. Public feed, no test variant exists.
 */
export const PARTNER_EXTRA_ENDPOINT = "https://httpmegosztas.posta.hu/PartnerExtra/Out/PostInfo.xml";

/**
 * MPL-specific metadata for detailed pickup points, derived from PartnerExtra fields.
 */
export interface MPLExtraPickupPointMetadata {
  servicePointType?: string;
  isPostPoint?: boolean;
  zipCode?: string;
  phoneArea?: string;
  email?: string;
  description?: string;
  workingHours?: PartnerExtraWorkingHoursDay[];
  gpsData?: PartnerExtraPost['gpsData'];
}

/**
 * Build the full address string from a PartnerExtra <post>.
 */
function buildAddress(post: PartnerExtraPost): string {
  const parts: string[] = [];
  if (post.street?.name) {
    const street = [post.street.name, post.street.type].filter(Boolean).join(' ');
    parts.push(post.street.houseNumber ? `${street} ${post.street.houseNumber}` : street);
  } else if (post.street?.houseNumber) {
    parts.push(post.street.houseNumber);
  }
  if (post.city) {
    parts.push(post['@_zipCode'] ? `${post.city} ${post['@_zipCode']}` : post.city);
  } else if (post['@_zipCode']) {
    parts.push(post['@_zipCode']);
  }
  return parts.join(', ');
}

/**
 * Maps a PartnerExtra <post> entry to a canonical PickupPoint.
 */
function mapPartnerExtraPostToPickupPoint(post: PartnerExtraPost): PickupPoint {
  const id = post.ID || `mpl-extra-${Math.random().toString(36).slice(2, 9)}`;

  const metadata: MPLExtraPickupPointMetadata = {};

  if (post.ServicePointType) metadata.servicePointType = post.ServicePointType;
  if (post['@_isPostPoint']) metadata.isPostPoint = post['@_isPostPoint'] === '1';
  if (post['@_zipCode']) metadata.zipCode = post['@_zipCode'];
  if (post.phoneArea) metadata.phoneArea = post.phoneArea;
  if (post.email) metadata.email = post.email;
  if (post.description) metadata.description = post.description;

  const workingHours = extractPartnerExtraWorkingHoursDays(post);
  if (workingHours.length > 0) metadata.workingHours = workingHours;

  if (post.gpsData) metadata.gpsData = post.gpsData;

  return {
    id,
    name: post.name,
    country: 'hu', // MPL is Hungary-based
    postalCode: post['@_zipCode'],
    city: post.city,
    street: post.street
      ? [post.street.name, post.street.type, post.street.houseNumber].filter(Boolean).join(' ')
      : undefined,
    address: buildAddress(post),
    latitude: parseHungarianDecimal(post.gpsData?.WGSLat),
    longitude: parseHungarianDecimal(post.gpsData?.WGSLon),
    openingHours: normalizePartnerExtraWorkingHours(workingHours),
    contact: {
      phone: post.phoneArea,
      email: post.email,
    },
    dropoffAllowed: true,
    pickupAllowed: true,
    metadata,
    raw: post,
  };
}

/**
 * Fetch detailed pickup points from the MPL PartnerExtra feed.
 *
 * Makes an unauthenticated GET to the public XML endpoint, parses the feed,
 * and normalizes each <post> entry into a canonical PickupPoint.
 *
 * Note on logging: By default, raw responses are logged as summaries only
 * to avoid polluting logs with hundreds of pickup point entries.
 *
 * @param req Request (credentials and options are optional — the feed is public)
 * @param ctx Adapter context with HTTP client and logger
 * @returns FetchPickupPointsResponse with normalized pickup points
 * @throws CarrierError on HTTP error or response parsing failure
 */
export async function fetchDetailedPickupPoints(
  req: FetchPickupPointsRequest,
  ctx: AdapterContext,
): Promise<FetchPickupPointsResponse> {
  if (!ctx.http) {
    throw new CarrierError(
      "HTTP client not provided in adapter context",
      "Permanent",
      { raw: "Missing ctx.http" }
    );
  }

  try {
    // Validate request shape (credentials optional, options optional)
    const validated = safeValidateFetchDetailedPickupPointsRequest(req);
    if (!validated.success) {
      throw new CarrierError(
        `Invalid request: ${validated.error.message}`,
        "Validation",
        { raw: serializeForLog(validated.error) as unknown }
      );
    }

    safeLog(
      ctx.logger,
      'debug',
      'Fetching MPL detailed pickup points from PartnerExtra',
      createLogEntry(
        { endpoint: PARTNER_EXTRA_ENDPOINT },
        null,
        ctx,
        ['fetchDetailedPickupPoints']
      ),
      ctx,
      ['fetchDetailedPickupPoints']
    );

    // Make the unauthenticated GET request; request XML as text.
    const httpResponse = await ctx.http.get<string>(PARTNER_EXTRA_ENDPOINT, {
      responseType: 'text',
    });

    if (httpResponse.status !== 200) {
      throw new CarrierError(
        `MPL PartnerExtra returned status ${httpResponse.status}`,
        httpResponse.status >= 500 ? 'Transient' : 'Permanent',
        { raw: httpResponse.body }
      );
    }

    const xmlBody = httpResponse.body;
    if (!xmlBody || typeof xmlBody !== 'string' || xmlBody.trim() === '') {
      throw new CarrierError(
        "Invalid response from MPL PartnerExtra: empty XML body",
        "Permanent",
        { raw: httpResponse.body }
      );
    }

    // Parse the XML feed
    let postInfo;
    try {
      postInfo = parsePartnerExtraPostInfo(xmlBody);
    } catch (parseErr) {
      throw new CarrierError(
        `Failed to parse MPL PartnerExtra XML: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        "Permanent",
        { raw: xmlBody }
      );
    }

    const posts = extractPartnerExtraPosts(postInfo);
    if (posts.length === 0) {
      safeLog(
        ctx.logger,
        'debug',
        'MPL PartnerExtra returned no pickup points',
        createLogEntry(
          { count: 0 },
          null,
          ctx,
          ['fetchDetailedPickupPoints']
        ),
        ctx,
        ['fetchDetailedPickupPoints']
      );

      return {
        points: [],
        summary: {
          totalCount: 0,
          updatedAt: new Date().toISOString(),
        },
        rawCarrierResponse: postInfo,
      };
    }

    // Map each post to canonical PickupPoint, skipping entries that fail
    const points: PickupPoint[] = posts
      .map((post: PartnerExtraPost, index: number) => {
        try {
          if (!post || typeof post !== 'object') {
            ctx.logger?.warn("Skipping invalid PartnerExtra post entry: not an object", {
              index,
              entryType: typeof post,
            });
            return null;
          }
          return mapPartnerExtraPostToPickupPoint(post);
        } catch (err) {
          ctx.logger?.warn("Failed to map PartnerExtra post entry", {
            index,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      })
      .filter((p: PickupPoint | null): p is PickupPoint => p !== null);

    safeLog(
      ctx.logger,
      'info',
      'Successfully fetched and mapped MPL detailed pickup points',
      {
        count: points.length,
        succeeded: points.length,
        failed: posts.length - points.length,
      },
      ctx,
      ['fetchDetailedPickupPoints']
    );

    return {
      points,
      summary: {
        totalCount: points.length,
        updatedAt: new Date().toISOString(),
      },
      rawCarrierResponse: postInfo,
    };
  } catch (err) {
    // Handle caught CarrierErrors
    if (err instanceof CarrierError) {
      throw err;
    }

    // Convert unknown errors to CarrierError
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger?.error("Failed to fetch MPL detailed pickup points", {
      error: errorMessage,
      type: err instanceof Error ? err.constructor.name : typeof err,
    });

    throw new CarrierError(
      `Failed to fetch MPL detailed pickup points: ${errorMessage}`,
      'Transient',
      { raw: err }
    );
  }
}
