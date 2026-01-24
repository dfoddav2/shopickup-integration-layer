/**
 * Foxpost Pickup Points Capability
 * 
 * Fetches and normalizes the list of Foxpost APMs (Automated Parcel Machines) and pickup points
 * from the public JSON feed at https://cdn.foxpost.hu/foxplus.json
 * 
 * The feed is updated hourly by Foxpost and contains all active pickup points with their
 * details, opening hours, payment options, and services.
 */

import type {
  FetchPickupPointsRequest,
  FetchPickupPointsResponse,
  PickupPoint,
  AdapterContext,
  CarrierError as CarrierErrorType,
} from "@shopickup/core";
import { CarrierError, safeLog, createLogEntry } from "@shopickup/core";

/**
 * Foxpost-specific metadata for pickup points
 * Contains carrier-specific fields not part of the canonical PickupPoint type
 */
interface FoxpostApmMetadata {
  /** Depot code associated with the APM */
  depot?: string;
  /** Load status of the APM (how full it is) */
  load?: "normal loaded" | "medium loaded" | "overloaded";
  /** Manufacturer/type of the APM hardware */
  apmType?: "Cleveron" | "Keba" | "Rollkon" | "Rotte";
  /** List of substitute APM IDs in case this APM is full or out of order */
  substitutes?: string[];
  /** Variant/model of the APM */
  variant?: "FOXPOST A-BOX" | "FOXPOST Z-BOX" | "Packeta Z-BOX" | "Packeta Z-Pont";
  /** Schedule of emptying and filling operations */
  fillEmptyList?: Array<{ emptying: string; filling: string }>;
  /** Service access points (ssapt field) */
  ssapt?: string;
  /** Service dispatch points (sdapt field) */
  sdapt?: string;
}

/**
 * Raw Foxpost APM entry from the foxplus.json feed
 */
interface FoxpostApmEntry {
  place_id: number | string; // APM identifier - used in case of non-new connections, or in case of Packeta points
  operator_id: string; // APM identifier - used in case of new connection, if empty use place_id
  name: string;  // Name of the APM
  ssapt: string; // Only specific types of package allowed
  sdapt: string; // Only specific types of package allowed
  country: string; // ISO 3166-1 alpha-2
  address: string; // Full address string
  zip: string; // Postal code
  city: string;  // City name
  street: string;  // Street name
  findme: string;  // Additional address info - description on where to find the APM inside a given building / complex
  geolat: number | string; // Latitude coordinate
  geolng: number | string; // Longitude coordinate
  allowed2: "ALL" | "C2C" | "B2C"; // Allowed package types / services for the APM
  depot: string; // Associated depot code
  load: "normal loaded" | "medium loaded" | "overloaded";  // Load information
  isOutdoor: boolean;  // Is the APM located outdoors
  apmType: "Cleveron" | "Keba" | "Rollkon" | "Rotte"; // Manufacturer / type of the APM
  substitutes: string[]; // List of substitute APM IDs - in case APM is full or out of order
  open: { hetfo: string; kedd: string; szerda: string; csutortok: string; pentek: string; szombat: string; vasarnap: string; }; // Opening hours per day of week
  fillEmptyList: { emptying: string; filling: string; }[]; // List of scheduled emptying and filling times
  cardPayment: boolean; // Supports card payment
  cashPayment: boolean; // Supports cash payment
  iconUrl: string;  // URL to icon image on Foxpost's CDN
  variant: "FOXPOST A-BOX" | "FOXPOST Z-BOX" | "Packeta Z-BOX" | "Packeta Z-Pont";  // Shows whether APM is of type: FOXPOST A-BOX, FOXPOST Z-BOX, Packeta Z-BOX, Packeta Z-Pont
  paymentOptions: ("card" | "cash" | "link" | "app")[]; // Unified payment options
  paymentOptionsString: string; // Human-readable payment options in Hungarian
  service: ("pickup" | "dispatch")[]; // Services supported by the APM
  serviceString: string;  // Human-readable services in Hungarian
}

/**
 * Normalize a Foxpost APM entry to canonical PickupPoint
 */
function mapFoxpostApmToPickupPoint(apm: FoxpostApmEntry): PickupPoint {
  // Determine primary ID: operator_id if present and non-empty, otherwise place_id
  const operatorId = apm.operator_id?.trim();
  const placeId = apm.place_id?.toString().trim();

  const id = operatorId || placeId || `fallback-${Math.random().toString(36).slice(2, 9)}`;
  const providerId = operatorId ? placeId : operatorId;

  // Parse coordinates
  let latitude: number | undefined;
  let longitude: number | undefined;

  if (apm.geolat !== undefined && apm.geolat !== null) {
    latitude = typeof apm.geolat === 'string' ? parseFloat(apm.geolat) : apm.geolat;
    latitude = isNaN(latitude) ? undefined : latitude;
  }

  if (apm.geolng !== undefined && apm.geolng !== null) {
    longitude = typeof apm.geolng === 'string' ? parseFloat(apm.geolng) : apm.geolng;
    longitude = isNaN(longitude) ? undefined : longitude;
  }

  // Determine allowed services from allowed2 field
  // "ALL" = both pickup and dropoff
  // "B2C" = typically both pickup and dropoff for B2C
  // "C2C" = consumer-to-consumer (no dropoff)
  let pickupAllowed = true; // default to true as most APMs support pickup
  let dropoffAllowed = true; // default to true as most APMs support dropoff

  if (apm.allowed2 === "C2C") {
    // C2C typically means dropoff only (no pickup)
    dropoffAllowed = true;
    pickupAllowed = false;
  } else if (apm.allowed2 === "B2C") {
    // B2C allows both
    dropoffAllowed = true;
    pickupAllowed = true;
  } else if (apm.allowed2 === "ALL") {
    // ALL allows both
    dropoffAllowed = true;
    pickupAllowed = true;
  }

  // Build payment options array
  const paymentOptions: string[] = [];
  if (apm.cardPayment) {
    paymentOptions.push("card");
  }
  if (apm.cashPayment) {
    paymentOptions.push("cash");
  }
  // Include unified paymentOptions if available
  if (apm.paymentOptions && Array.isArray(apm.paymentOptions)) {
    paymentOptions.push(...apm.paymentOptions.filter((p: any) => !paymentOptions.includes(p)));
  }

  // Build address string if not provided
  let address = apm.address;
  if (!address && (apm.street || apm.city || apm.zip)) {
    const parts = [];
    if (apm.zip) parts.push(apm.zip);
    if (apm.city) parts.push(apm.city);
    if (apm.street) parts.push(apm.street);
    address = parts.join(", ");
  }

  // Collect all carrier-specific fields in metadata
  const metadata: FoxpostApmMetadata = {
    depot: apm.depot,
    load: apm.load,
    apmType: apm.apmType,
    substitutes: apm.substitutes,
    variant: apm.variant,
    fillEmptyList: apm.fillEmptyList,
    ssapt: apm.ssapt,
    sdapt: apm.sdapt,
  };

  // Remove undefined keys from metadata
  const cleanedMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  ) as FoxpostApmMetadata;

  return {
    id,
    providerId: providerId || undefined,
    name: apm.name,
    country: apm.country?.toLowerCase(),
    postalCode: apm.zip,
    city: apm.city,
    street: apm.street,
    address,
    findme: apm.findme,
    latitude,
    longitude,
    openingHours: apm.open,
    dropoffAllowed,
    pickupAllowed,
    isOutdoor: apm.isOutdoor,
    paymentOptions: paymentOptions.length > 0 ? paymentOptions : undefined,
    contact: undefined, // Foxpost doesn't provide contact info in feed
    metadata: Object.keys(cleanedMetadata).length > 0 ? cleanedMetadata : undefined,
    raw: apm,
  };
}

/**
 * Fetch pickup points (APMs) from Foxpost
 * 
 * Fetches the public JSON feed from https://cdn.foxpost.hu/foxplus.json
 * and normalizes each APM entry to the canonical PickupPoint format.
 * 
 * Note on logging: By default, raw APM responses are logged as summaries only
 * to avoid polluting logs with hundreds of pickup point entries.
 * To customize logging behavior, pass loggingOptions in the adapter context:
 * {
 *   loggingOptions: {
 *     logRawResponse: true,        // Log full response
 *     logRawResponse: false,       // Skip logging raw entirely
 *     logRawResponse: 'summary',   // Log only summary (default)
 *     maxArrayItems: 50,           // Increase items shown in arrays
 *     silentOperations: ['fetchPickupPoints']  // Suppress all logging
 *   }
 * }
 * 
 * When using the withOperationName wrapper from @shopickup/core, the operation name
 * is automatically injected and logging control is applied automatically.
 * 
 * @param req Request with optional filters and credentials (not used for public feed)
 * @param ctx Adapter context with HTTP client (operationName set by wrapper or manually)
 * @returns FetchPickupPointsResponse with normalized pickup points
 */
export async function fetchPickupPoints(
  req: FetchPickupPointsRequest,
  ctx: AdapterContext
): Promise<FetchPickupPointsResponse> {
  if (!ctx.http) {
    throw new CarrierError(
      "HTTP client not provided in adapter context",
      "Permanent",
      { raw: "Missing ctx.http" }
    );
  }

  const feedUrl = "https://cdn.foxpost.hu/foxplus.json";

  try {
    // Fetch the public JSON feed (no authentication needed)
    // operationName is already set by withOperationName wrapper
    safeLog(
      ctx.logger,
      'debug',
      'Fetching Foxpost APM feed',
      { url: feedUrl },
      ctx
    );

    const response = await ctx.http.get(feedUrl);

    // Extract body from normalized HttpResponse
    const apmData = response.body;

    // Validate response is an array
    if (!Array.isArray(apmData)) {
      throw new Error("Expected array of APMs from Foxpost feed, got: " + typeof apmData);
    }

    safeLog(
      ctx.logger,
      'debug',
      'Fetched Foxpost APM feed',
      createLogEntry({ url: feedUrl }, apmData, ctx),
      ctx
    );

    // Map each entry to PickupPoint
    const points: PickupPoint[] = apmData.map((apm: FoxpostApmEntry) => {
      try {
        return mapFoxpostApmToPickupPoint(apm);
      } catch (err) {
        ctx.logger?.warn("Failed to map APM entry", { apm, error: String(err) });
        // Skip entries that can't be mapped
        return null;
      }
    }).filter((p: PickupPoint | null): p is PickupPoint => p !== null);

    safeLog(
      ctx.logger,
      'info',
      'Successfully fetched and mapped Foxpost APMs',
      {
        count: points.length,
        succeeded: points.length,
        failed: apmData.length - points.length,
      },
      ctx
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.logger?.error("Failed to fetch Foxpost APM feed", { error: errorMessage, url: feedUrl });

    // Categorize error for retry logic
    let category: "Permanent" | "Transient" = "Transient";
    let details: Record<string, any> = { raw: err };

    // If it's a network error or 5xx, it's transient
    // If it's 4xx or parsing error, it's permanent
    if (err instanceof Error && err.message.includes("Expected array")) {
      category = "Permanent";
      details.reason = "Invalid response format";
    }

    throw new CarrierError(
      `Failed to fetch Foxpost APM feed: ${errorMessage}`,
      category,
      details
    );
  }
}
