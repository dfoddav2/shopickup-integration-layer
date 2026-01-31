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
 */

import type {
  FetchPickupPointsRequest,
  FetchPickupPointsResponse,
  AdapterContext,
} from '@shopickup/core';
import {
  CarrierError,
  safeLog,
  createLogEntry,
} from '@shopickup/core';
import { mapGLSDeliveryPointsToPickupPoints } from '../mappers/index.js';
import type { GLSDeliveryPointsFeed } from '../types/index.js';

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
