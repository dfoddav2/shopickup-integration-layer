/**
 * Mappers for Foxpost adapter
 * Converts between canonical Shopickup types and Foxpost API types
 */

import type { Shipment, Parcel, Address, TrackingEvent } from "@shopickup/core";
import type {
  CreateParcelRequest as FoxpostParcelRequest,
  TrackDTO as FoxpostTrackDTO,
} from "../client/types";

/**
 * Map canonical Address to Foxpost address format
 */
export function mapAddressToFoxpost(addr: Address): {
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
export function determineFoxpostSize(parcel: Parcel): string {
  // If no dimensions, default to 's' (small)
  if (!parcel.dimensions) {
    return "s";
  }

  const { length, width, height } = parcel.dimensions;
  const volume = length * width * height;

  // Very rough heuristic based on volume
  if (volume < 5000) return "xs";
  if (volume < 15000) return "s";
  if (volume < 50000) return "m";
  if (volume < 100000) return "l";
  return "xl";
}

/**
 * Map canonical Parcel + Shipment to Foxpost CreateParcelRequest
 */
export function mapParcelToFoxpost(
  parcel: Parcel,
  shipment: Shipment,
  options: {
    isWeb?: boolean;
    isRedirect?: boolean;
  } = {}
): FoxpostParcelRequest {
  const recipient = mapAddressToFoxpost(shipment.recipient);
  const sender = shipment.sender ? mapAddressToFoxpost(shipment.sender) : null;

  const foxpostRequest: FoxpostParcelRequest = {
    recipientName: recipient.name,
    recipientPhone: recipient.phone,
    recipientEmail: recipient.email,
    recipientCity: recipient.city,
    recipientZip: recipient.zip,
    recipientAddress: recipient.address,
    recipientCountry: recipient.country,
    size: determineFoxpostSize(parcel),
    // Optional fields
    refCode: shipment.reference
      ?.substring(0, 30)
      .concat(`-${parcel.id.substring(0, 10)}`),
    comment: parcel.metadata?.["comment"] as string | undefined,
    fragile: (parcel.metadata?.["fragile"] as boolean) || false,
  };

  return foxpostRequest;
}

/**
 * Map Foxpost tracking status code to canonical TrackingStatus
 */
export function mapFoxpostStatusToCanonical(
  foxpostStatus: string
): "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION" | "RETURNED" | "CANCELLED" {
  // Foxpost status codes from OpenAPI
  const statusMapping: Record<string, any> = {
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
 */
export function mapFoxpostTrackToCanonical(
  track: FoxpostTrackDTO
): TrackingEvent {
  return {
    timestamp: new Date(track.statusDate || new Date()),
    status: mapFoxpostStatusToCanonical(track.status || "PENDING"),
    description: track.longName || track.status || "Unknown status",
    raw: track,
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
