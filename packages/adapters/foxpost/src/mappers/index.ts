/**
 * Mappers for Foxpost adapter
 * Converts between canonical Shopickup types and Foxpost API types
 */

import type { Parcel, TrackingEvent, Delivery } from "@shopickup/core";
import type {
  CreateParcelRequest as FoxpostParcelRequest,
  TrackDTO as FoxpostTrackDTO,
  TraceDTO as FoxpostTraceDTO,
} from '../types/generated.js';
import type { FoxpostParcel, FoxpostPackageSize, FoxCreateParcelRequestItem } from '../validation.js';
import { mapFoxpostStatusCode, getFoxpostStatusDescription } from './trackStatus.js';

const FOXPOST_SIZES = ["xs", "s", "m", "l", "xl"] as const;
type FoxpostSize = typeof FOXPOST_SIZES[number]; // "xs" | "s" | "m" | "l" | "xl"

type FoxpostSizeRule = {
  size: FoxpostSize;
  // Sorted ascending [min, mid, max] to be orientation-agnostic
  maxDimsCm: [number, number, number];
  maxWeightKg: number;
};

/**
 * Foxpost parcel size rules based on published locker constraints.
 *
 * Notes:
 * - We use conservative common-denominator dimensions that are safe across legacy/newer lockers.
 * - Dimensions are compared in sorted order to allow parcel rotation.
 * - Weight caps are enforced per size tier.
 */
const FOXPOST_SIZE_RULES: FoxpostSizeRule[] = [
  { size: 'xs', maxDimsCm: [7.3, 17, 61], maxWeightKg: 5 },
  { size: 's', maxDimsCm: [8, 36, 61], maxWeightKg: 15 },
  { size: 'm', maxDimsCm: [17, 36, 61], maxWeightKg: 25 },
  { size: 'l', maxDimsCm: [36, 36, 61], maxWeightKg: 25 },
  { size: 'xl', maxDimsCm: [36, 60, 61], maxWeightKg: 25 },
];

function getWeightKg(parcel: Parcel): number | undefined {
  const grams = parcel.package?.weightGrams;
  if (typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0) {
    return undefined;
  }
  return grams / 1000;
}

function fitsDims(
  parcelDimsSorted: [number, number, number],
  maxDimsSorted: [number, number, number],
): boolean {
  return (
    parcelDimsSorted[0] <= maxDimsSorted[0]
    && parcelDimsSorted[1] <= maxDimsSorted[1]
    && parcelDimsSorted[2] <= maxDimsSorted[2]
  );
}

/**
 * Map canonical Address (from Parcel.sender or Parcel.recipient) to Foxpost address format
 */
export function mapAddressToFoxpost(addr: { name: string; street: string; city: string; postalCode: string; country: string; phone?: string; email?: string }): {
  name: string;
  phone: string;
  email: string;
  city?: string;
  zip?: string;
  address?: string;
  country: string;
} {
  return {
    name: addr.name.substring(0, 150), // Foxpost max length
    phone: addr.phone || "",
    email: addr.email || "",
    city: addr.city?.substring(0, 25),
    zip: addr.postalCode,
    address: addr.street?.substring(0, 150),
    country: addr.country || "HU", // Default to Hungary
  };
}

/**
 * Determine Foxpost parcel size from carrier rules.
 *
 * Precedence:
 * 1) If dimensions + weight are available, choose the smallest tier that fits both.
 * 2) If dimensions are available (weight missing), choose the smallest tier that fits dimensions.
 * 3) If dimensions are missing, fall back to legacy default "s".
 */
export function determineFoxpostSize(parcel: Parcel): FoxpostSize | undefined {
  const dims = parcel.package.dimensionsCm;
  const weightKg = getWeightKg(parcel);

  if (!dims) {
    return 's';
  }

  const parcelDimsSorted = [dims.length, dims.width, dims.height]
    .sort((a, b) => a - b) as [number, number, number];

  for (const rule of FOXPOST_SIZE_RULES) {
    const dimsFit = fitsDims(parcelDimsSorted, rule.maxDimsCm);
    if (!dimsFit) {
      continue;
    }

    if (weightKg === undefined || weightKg <= rule.maxWeightKg) {
      return rule.size;
    }
  }

  // If dimensions exceed known limits, best-effort fallback to largest tier.
  return 'xl';
}

/**
 * Map canonical Parcel to Foxpost CreateParcelRequest (strongly-typed)
 * Returns typed FoxCreateParcelRequestItem with lenient validation support
 * 
 * Handles both HOME delivery (full address) and PICKUP_POINT delivery (APM/locker)
 */
export function mapParcelToFoxpostRequest(
  parcel: Parcel,
  options: {
    isWeb?: boolean;
    isRedirect?: boolean;
    size?: FoxpostSize;
    comment?: string;
    label?: boolean;
    uniqueBarcode?: string;
  } = {}
): FoxCreateParcelRequestItem {
  const buildRefCode = (parcel: Parcel): string | undefined => {
    const reference = parcel.references?.customerReference?.trim();
    if (!reference) return undefined;

    const suffix = `-${parcel.id.substring(0, 10)}`;
    return reference.substring(0, Math.max(0, 30 - suffix.length)).concat(suffix);
  };

  const delivery = parcel.recipient.delivery;
  const isHomeDelivery = delivery.method === 'HOME';
  const recipientAddr = isHomeDelivery
    ? delivery.address
    : undefined;

  const recipient = {
    name: parcel.recipient.contact.name.substring(0, 150),
    phone: parcel.recipient.contact.phone || "",
    email: parcel.recipient.contact.email || "",
    city: recipientAddr?.city?.substring(0, 25),
    zip: recipientAddr?.postalCode,
    address: recipientAddr?.street?.substring(0, 150),
    country: recipientAddr?.country || "HU",
  };

  // COD amount from parcel if present, default to 0
  const codAmount = parcel.cod?.amount.amount ?? 0;

  // Use explicit size override if provided, otherwise derive from dimensions
  const parcelSize = options.size ?? determineFoxpostSize(parcel);

  // Comment priority: explicit option > metadata > fragile fallback
  const comment = options.comment
    ?? (parcel.metadata?.foxpostComment as string | undefined)
    ?? (parcel.handling?.fragile ? 'FRAGILE' : undefined);

  const baseRequest: any = {
    recipientName: recipient.name,
    recipientPhone: recipient.phone,
    recipientEmail: recipient.email,
    size: parcelSize?.toUpperCase() || 'S',
    cod: codAmount,
    // Optional fields
    refCode: buildRefCode(parcel),
    comment,
    fragile: parcel.handling?.fragile || false,
    label: options.label,
    uniqueBarcode: options.uniqueBarcode,
  };

  // HOME delivery includes address fields and delivery note
  if (isHomeDelivery) {
    return {
      ...baseRequest,
      recipientCity: recipient.city,
      recipientZip: recipient.zip,
      recipientAddress: recipient.address,
      recipientCountry: recipient.country,
      deliveryNote: delivery.instructions,
    } as FoxCreateParcelRequestItem;
  }

  // PICKUP_POINT delivery adds destination (locker/APM code)
  if (delivery.method === 'PICKUP_POINT') {
    const pickupPoint = delivery.pickupPoint;
    return {
      ...baseRequest,
      destination: pickupPoint?.id || '',
    } as FoxCreateParcelRequestItem;
  }

  return baseRequest as FoxCreateParcelRequestItem;
}

/**
 * Map canonical Parcel to Foxpost CreateParcelRequest
 * Parcel contains complete shipping details (sender, recipient, weight, service, etc.)
 * 
 * Handles both HOME delivery (full address) and PICKUP_POINT delivery (APM/locker)
 */
export function mapParcelToFoxpost(
  parcel: Parcel,
  options: {
    isWeb?: boolean;
    isRedirect?: boolean;
  } = {}
): FoxpostParcelRequest & { destination?: string } {
  const buildRefCode = (parcel: Parcel): string | undefined => {
    const reference = parcel.references?.customerReference?.trim();
    if (!reference) return undefined;

    const suffix = `-${parcel.id.substring(0, 10)}`;
    return reference.substring(0, Math.max(0, 30 - suffix.length)).concat(suffix);
  };

  const delivery = parcel.recipient.delivery;
  const isHomeDelivery = delivery.method === 'HOME';
  const recipientAddr = isHomeDelivery
    ? delivery.address
    : undefined;

  const recipient = {
    name: parcel.recipient.contact.name.substring(0, 150),
    phone: parcel.recipient.contact.phone || "",
    email: parcel.recipient.contact.email || "",
    city: recipientAddr?.city?.substring(0, 25),
    zip: recipientAddr?.postalCode,
    address: recipientAddr?.street?.substring(0, 150),
    country: recipientAddr?.country || "HU",
  };

  const foxpostRequest: FoxpostParcelRequest & { destination?: string } = {
    recipientName: recipient.name,
    recipientPhone: recipient.phone,
    recipientEmail: recipient.email,
    // HOME delivery includes address fields; APM leaves them undefined
    ...(isHomeDelivery && {
      recipientCity: recipient.city,
      recipientZip: recipient.zip,
      recipientAddress: recipient.address,
      recipientCountry: recipient.country,
    }),
    size: determineFoxpostSize(parcel),
    // Optional fields
    refCode: buildRefCode(parcel),
    comment: parcel.handling?.fragile ? 'FRAGILE' : undefined,
    fragile: parcel.handling?.fragile || false,
  };

  // For PICKUP_POINT delivery, add destination (locker/APM code)
  if (!isHomeDelivery && delivery.method === 'PICKUP_POINT') {
    const pickupPoint = delivery.pickupPoint;
    if (pickupPoint?.id) {
      foxpostRequest.destination = pickupPoint.id;
    }
  }

  return foxpostRequest;
}

/**
 * Map Foxpost tracking status code to canonical TrackingStatus
 * Uses comprehensive status mapping from trackStatus.ts
 * Unknown codes default to PENDING.
 */
export function mapFoxpostStatusToCanonical(
  foxpostStatus: string
): "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION" | "RETURNED" | "CANCELLED" {
  const mapping = mapFoxpostStatusCode(foxpostStatus);
  return mapping.canonical as any; // Safe cast: trackStatus map returns valid canonical values
}

/**
 * Map Foxpost TrackDTO to canonical TrackingEvent
 * 
 * Normalizes the Foxpost status code to a canonical TrackingStatus while preserving
 * the original carrier-specific code in `carrierStatusCode` for debugging and carrier-specific logic.
 */
export function mapFoxpostTrackToCanonical(
  track: FoxpostTrackDTO
): TrackingEvent {
  return {
    timestamp: new Date(track.statusDate || new Date()),
    status: mapFoxpostStatusToCanonical(track.status || "PENDING"),
    carrierStatusCode: track.status || undefined,
    description: track.longName || track.status || "Unknown status",
    location: track.location ? { facility: track.location } : undefined,
    raw: track,
  };
}

/**
 * Map Foxpost TraceDTO (from new /api/tracking/{barcode} endpoint) to canonical TrackingEvent
 * TraceDTO is returned in reverse chronological order (latest first) from the API
 * 
 * Normalizes the Foxpost status code to a canonical TrackingStatus while preserving
 * the original carrier-specific code in `carrierStatusCode`.
 * 
 * Includes both English and Hungarian human-readable descriptions from the status map.
 * 
 * Accepts both string and Date types for statusDate to support both raw API responses
 * and validated Zod-parsed responses (which transform to Date).
 * 
 * Example mapping:
 * - Foxpost "CREATE" -> canonical "PENDING" (carrierStatusCode: "CREATE", description: "Order created")
 * - Foxpost "HDINTRANSIT" -> canonical "OUT_FOR_DELIVERY" (carrierStatusCode: "HDINTRANSIT", description: "Out for home delivery")
 * - Foxpost "RECEIVE" -> canonical "DELIVERED" (carrierStatusCode: "RECEIVE", description: "Delivered to recipient")
 */
export function mapFoxpostTraceToCanonical(
  trace: FoxpostTraceDTO | { statusDate: string | Date; status?: string; shortName?: string; longName?: string; statusStationId?: string }
): TrackingEvent {
  const statusDate = typeof trace.statusDate === 'string'
    ? new Date(trace.statusDate)
    : trace.statusDate;

  const statusCode = (trace.status as string) || "PENDING";
  const statusMapping = mapFoxpostStatusCode(statusCode);

  // Prefer mapped human description; fall back to API data if available
  const humanDescription = statusMapping.human_en
    || ((trace as any).longName || (trace as any).shortName || null)
    || `Foxpost: ${statusCode}`;

  const humanDescriptionHu = statusMapping.human_hu || null;
  const stationId = (trace as any).statusStationId || (trace as any).statusStatidionId;

  return {
    timestamp: statusDate || new Date(),
    status: mapFoxpostStatusToCanonical(statusCode),
    carrierStatusCode: statusCode || undefined,
    location: stationId ? { facility: stationId } : undefined,
    description: humanDescription,
    descriptionLocalLanguage: humanDescriptionHu || undefined,
    raw: trace,
  };
}

/**
 * Map canonical Parcel to Foxpost carrier-specific parcel (HD or APM)
 * Discriminates based on Delivery type in the parcel
 * 
 * @param parcel - Canonical parcel with full shipping details
 * @param options - Additional mapping options (COD, comment, etc.)
 * @returns FoxpostParcelHD | FoxpostParcelAPM with type discriminator set
 */
export function mapParcelToFoxpostCarrierType(
  parcel: Parcel,
  options: {
    cod?: number;
    comment?: string;
    deliveryNote?: string;
    fragile?: boolean;
  } = {}
): FoxpostParcel {
  const recipient = parcel.recipient;
  const delivery = recipient.delivery;

  // Determine parcel size
  const size = (determineFoxpostSize(parcel) || 's').toUpperCase() as 'XS' | 'S' | 'M' | 'L' | 'XL' | '1' | '2' | '3' | '4' | '5';

  // COD amount from parcel.cod or options override
  const codAmount = options.cod ?? parcel.cod?.amount.amount ?? 0;

  // Fragile from options or parcel.handling
  const isFragile = options.fragile ?? parcel.handling?.fragile ?? false;

  // If delivery is PICKUP_POINT, create APM parcel
  if (delivery.method === 'PICKUP_POINT') {
    const apmParcel: FoxpostParcel = {
      type: 'APM',
      cod: codAmount,
      comment: options.comment,
      destination: delivery.pickupPoint.id,
      recipientEmail: recipient.contact.email || '',
      recipientName: recipient.contact.name.substring(0, 150),
      recipientPhone: recipient.contact.phone || '',
      refCode: parcel.references?.customerReference?.substring(0, 30),
      size,
    };
    return apmParcel;
  }

  // Otherwise (HOME delivery), create HD parcel
  const homeDelivery = delivery;
  const recipientAddr = homeDelivery.address;

  const hdParcel: FoxpostParcel = {
    type: 'HD',
    cod: codAmount,
    comment: options.comment,
    deliveryNote: options.deliveryNote || homeDelivery.instructions,
    fragile: isFragile,
    label: false, // Default: Foxpost prints label for B2B, not for C2C
    recipientAddress: `${recipientAddr.street || ''}, ${recipientAddr.postalCode || ''} ${recipientAddr.city || ''}`.trim(),
    recipientCity: recipientAddr.city,
    recipientCountry: recipientAddr.country,
    recipientEmail: recipient.contact.email || '',
    recipientName: recipient.contact.name.substring(0, 150),
    recipientPhone: recipient.contact.phone || '',
    recipientZip: recipientAddr.postalCode,
    refCode: parcel.references?.customerReference?.substring(0, 30),
    size,
  };

  return hdParcel;
}
