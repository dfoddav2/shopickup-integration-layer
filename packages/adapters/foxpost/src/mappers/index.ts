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
import type { FoxpostParcel, FoxpostPackageSize } from '../validation.js';

const FOXPOST_SIZES = ["xs", "s", "m", "l", "xl"] as const;
type FoxpostSize = typeof FOXPOST_SIZES[number]; // "xs" | "s" | "m" | "l" | "xl"

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
 * Determine parcel size based on dimensions or weight
 * Foxpost sizes: xs, s, m, l, xl
 */
export function determineFoxpostSize(parcel: Parcel): FoxpostSize | undefined {
  // If no dimensions, default to 's' (small)
  if (!parcel.package.dimensionsCm) {
    return "s";
  }

  const { length, width, height } = parcel.package.dimensionsCm;
  const volume = length * width * height;

  // Very rough heuristic based on volume
  let candidate: FoxpostSize = "xs";
  if (volume < 5000) {
    candidate = "xs";
  } else if (volume < 15000) {
    candidate = "s";
  } else if (volume < 50000) {
    candidate = "m";
  } else if (volume < 100000) {
    candidate = "l";
  } else {
    candidate = "xl";
  }

  return candidate;
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
    refCode: parcel.references?.customerReference
      ?.substring(0, 30)
      .concat(`-${parcel.id.substring(0, 10)}`),
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
 */
export function mapFoxpostStatusToCanonical(
  foxpostStatus: string
): "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION" | "RETURNED" | "CANCELLED" {
  // Foxpost status codes from OpenAPI
  const statusMapping: Record<string, "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION" | "RETURNED" | "CANCELLED"> = {
    CREATE: "PENDING",
    OPERIN: "IN_TRANSIT",
    OPEROUT: "IN_TRANSIT",
    RECEIVE: "DELIVERED",
    RETURN: "RETURNED",
    REDIRECT: "IN_TRANSIT",
    OVERTIMEOUT: "EXCEPTION",
    SORTIN: "IN_TRANSIT",
    SORTOUT: "IN_TRANSIT",
    SLOTCHANGE: "IN_TRANSIT",
    OVERTIMED: "EXCEPTION",
    MPSIN: "IN_TRANSIT",
    C2CIN: "IN_TRANSIT",
    HDSENT: "OUT_FOR_DELIVERY",
    HDDEPO: "IN_TRANSIT",
    HDINTRANSIT: "OUT_FOR_DELIVERY",
    HDRETURN: "RETURNED",
    HDRECEIVE: "DELIVERED",
    WBXREDIRECT: "IN_TRANSIT",
    BACKTOSENDER: "RETURNED",
    HDHUBIN: "IN_TRANSIT",
    HDHUBOUT: "OUT_FOR_DELIVERY",
    HDCOURIER: "OUT_FOR_DELIVERY",
    HDUNDELIVERABLE: "EXCEPTION",
    PREPAREDFORPD: "IN_TRANSIT",
    INWAREHOUSE: "IN_TRANSIT",
    COLLECTSENT: "IN_TRANSIT",
    C2BIN: "IN_TRANSIT",
    RETURNED: "DELIVERED",
    COLLECTED: "DELIVERED",
    BACKLOGINFULL: "EXCEPTION",
    BACKLOGINFAIL: "EXCEPTION",
    MISSORT: "EXCEPTION",
    EMPTYSLOT: "EXCEPTION",
    RESENT: "IN_TRANSIT",
    PREREDIRECT: "IN_TRANSIT",
  };

  return statusMapping[foxpostStatus] || "PENDING";
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
 * Accepts both string and Date types for statusDate to support both raw API responses
 * and validated Zod-parsed responses (which transform to Date).
 * 
 * Example mapping:
 * - Foxpost "CREATE" -> canonical "PENDING" (carrierStatusCode: "CREATE")
 * - Foxpost "HDINTRANSIT" -> canonical "OUT_FOR_DELIVERY" (carrierStatusCode: "HDINTRANSIT")
 * - Foxpost "RECEIVE" -> canonical "DELIVERED" (carrierStatusCode: "RECEIVE")
 */
export function mapFoxpostTraceToCanonical(
  trace: FoxpostTraceDTO | { statusDate: string | Date; status?: string; shortName?: string; longName?: string }
): TrackingEvent {
  const statusDate = typeof trace.statusDate === 'string' 
    ? new Date(trace.statusDate) 
    : trace.statusDate;
    
  return {
    timestamp: statusDate || new Date(),
    status: mapFoxpostStatusToCanonical((trace.status as string) || "PENDING"),
    carrierStatusCode: (trace.status as string) || undefined,
    description: ((trace as any).longName || (trace as any).shortName || (trace.status as string) || "Unknown status"),
    raw: trace,
  };
}

/**
 * Generate short description for Foxpost status
 */
export function getFoxpostStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    CREATE: "Parcel created",
    RECEIVE: "Parcel received at facility",
    HDSENT: "Home delivery initiated",
    HDDELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    RETURNED: "Returned to sender",
    EXCEPTION: "Exception occurred",
  };

  return descriptions[status] || status;
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
