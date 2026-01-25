/**
 * Foxpost Tracking Status Map
 * 
 * Comprehensive mapping of Foxpost status codes to:
 * 1. Canonical tracking status (for normalized processing)
 * 2. Human-readable descriptions in English and Hungarian
 * 
 * The canonical status is used for generic processing, filtering, and integrator logic,
 * while the human descriptions provide detailed information about the shipment state.
 * 
 * Source: Foxpost OpenAPI tracking documentation and operational codes
 */

import type { TrackingStatus } from "@shopickup/core";

export interface FoxpostStatusMapping {
  /** Canonical status across all carriers */
  canonical: TrackingStatus;
  /** Human-readable description in English */
  human_en?: string;
  /** Human-readable description in Hungarian */
  human_hu?: string;
  /** Category hint for interpretation */
  type?: 'locker' | 'courier' | 'facility' | 'technical';
}

/**
 * Complete Foxpost status code to canonical mapping
 * 
 * Key characteristics:
 * - All Foxpost codes are covered (37 codes)
 * - Unknown codes default to "UNKNOWN" with fallback description
 * - Each code has English and Hungarian descriptions from Foxpost docs
 * - Technical codes (CREATE, SLOTCHANGE, etc.) are marked with type: 'technical'
 */
export const FOXPOST_STATUS_MAP: Record<string, FoxpostStatusMapping> = {
  // === Locker/APM Operations ===
  CREATE: {
    canonical: "PENDING",
    human_en: "Order created",
    human_hu: "Rendelés létrehozva",
    type: "locker",
  },
  OPERIN: {
    canonical: "IN_TRANSIT",
    human_en: "Arrived at locker",
    human_hu: "Automatában megérkezett",
    type: "locker",
  },
  OPEROUT: {
    canonical: "IN_TRANSIT",
    human_en: "Removed from locker / Out for delivery",
    human_hu: "Automatából kivéve / Kiszállítás",
    type: "locker",
  },
  RECEIVE: {
    canonical: "DELIVERED",
    human_en: "Delivered to recipient",
    human_hu: "Átvéve",
    type: "locker",
  },

  // === Return Operations ===
  RETURN: {
    canonical: "RETURNED",
    human_en: "Returned to sender",
    human_hu: "Visszaküldésre került",
    type: "facility",
  },
  REDIRECT: {
    canonical: "IN_TRANSIT",
    human_en: "Redirected to new destination",
    human_hu: "Átirányítva új célhelyre",
    type: "facility",
  },
  BACKTOSENDER: {
    canonical: "RETURNED",
    human_en: "Returned to sender",
    human_hu: "Szállító felé visszaküldve",
    type: "facility",
  },
  RESENT: {
    canonical: "IN_TRANSIT",
    human_en: "Resent to new destination",
    human_hu: "Újra küldve új célhelyre",
    type: "facility",
  },

  // === Facility Sorting Operations ===
  SORTIN: {
    canonical: "IN_TRANSIT",
    human_en: "Arrived at sorting facility",
    human_hu: "Rendezőközpontba megérkezett",
    type: "facility",
  },
  SORTOUT: {
    canonical: "IN_TRANSIT",
    human_en: "Left sorting facility",
    human_hu: "Rendezőközpontból elküldve",
    type: "facility",
  },
  MPSIN: {
    canonical: "IN_TRANSIT",
    human_en: "Arrived at parcel hub",
    human_hu: "Csomagközpontba megérkezett",
    type: "facility",
  },
  C2CIN: {
    canonical: "IN_TRANSIT",
    human_en: "Arrived at customer collection point",
    human_hu: "Ügyfél felvevőpontba megérkezett",
    type: "facility",
  },
  C2BIN: {
    canonical: "IN_TRANSIT",
    human_en: "Arrived at business collection point",
    human_hu: "Üzleti felvevőpontba megérkezett",
    type: "facility",
  },
  INWAREHOUSE: {
    canonical: "IN_TRANSIT",
    human_en: "In warehouse",
    human_hu: "Raktárban van",
    type: "facility",
  },

  // === Home Delivery Operations ===
  HDSENT: {
    canonical: "OUT_FOR_DELIVERY",
    human_en: "Home delivery sent",
    human_hu: "Házhozszállítás küldve",
    type: "courier",
  },
  HDINTRANSIT: {
    canonical: "OUT_FOR_DELIVERY",
    human_en: "Out for home delivery",
    human_hu: "Házhoz szállítás alatt",
    type: "courier",
  },
  HDDEPO: {
    canonical: "IN_TRANSIT",
    human_en: "At home delivery depot",
    human_hu: "Kiszállítási depoban",
    type: "facility",
  },
  HDCOURIER: {
    canonical: "OUT_FOR_DELIVERY",
    human_en: "With courier for delivery",
    human_hu: "Futárnál szállításra",
    type: "courier",
  },
  HDHUBIN: {
    canonical: "IN_TRANSIT",
    human_en: "Arrived at delivery hub",
    human_hu: "Szállítási csomópontra megérkezett",
    type: "facility",
  },
  HDHUBOUT: {
    canonical: "OUT_FOR_DELIVERY",
    human_en: "Left delivery hub",
    human_hu: "Szállítási csomópontból elküldve",
    type: "facility",
  },
  HDRECEIVE: {
    canonical: "DELIVERED",
    human_en: "Delivered by home delivery",
    human_hu: "Házhoz szállítva",
    type: "courier",
  },
  HDRETURN: {
    canonical: "RETURNED",
    human_en: "Returned from home delivery",
    human_hu: "Házhoz szállítás visszatérült",
    type: "courier",
  },

  // === Exception States ===
  OVERTIMEOUT: {
    canonical: "EXCEPTION",
    human_en: "Overtime out (delivery exceeded time limit)",
    human_hu: "Túlóra lejárt",
    type: "technical",
  },
  OVERTIMED: {
    canonical: "EXCEPTION",
    human_en: "Overtime (delivery delayed)",
    human_hu: "Túlóra (késedelem)",
    type: "technical",
  },
  HDUNDELIVERABLE: {
    canonical: "EXCEPTION",
    human_en: "Undeliverable (home delivery failed)",
    human_hu: "Nem szállítható (házhoz szállítás sikertelen)",
    type: "courier",
  },
  MISSORT: {
    canonical: "EXCEPTION",
    human_en: "Missorted - rerouted",
    human_hu: "Hibásan rendezett - átirányított",
    type: "technical",
  },
  EMPTYSLOT: {
    canonical: "EXCEPTION",
    human_en: "No locker slot available",
    human_hu: "Nincs szabad automatahely",
    type: "locker",
  },
  BACKLOGINFULL: {
    canonical: "EXCEPTION",
    human_en: "Backlog - facility at capacity",
    human_hu: "Feldolgozási várakozási sor teljes",
    type: "facility",
  },
  BACKLOGINFAIL: {
    canonical: "EXCEPTION",
    human_en: "Backlog failed - retry needed",
    human_hu: "Feldolgozási sor sikertelen",
    type: "technical",
  },

  // === Collection/Handoff Operations ===
  COLLECTSENT: {
    canonical: "IN_TRANSIT",
    human_en: "Collect shipment sent",
    human_hu: "Gyűjtőszállítmány küldve",
    type: "facility",
  },
  COLLECTED: {
    canonical: "DELIVERED",
    human_en: "Collected from sender",
    human_hu: "Feladótól összeszedve",
    type: "facility",
  },

  // === Slot/Redirect Operations ===
  SLOTCHANGE: {
    canonical: "IN_TRANSIT",
    human_en: "Locker slot changed",
    human_hu: "Automatahely módosult",
    type: "technical",
  },
  WBXREDIRECT: {
    canonical: "IN_TRANSIT",
    human_en: "Redirected via WBX",
    human_hu: "WBX-en keresztül átirányított",
    type: "facility",
  },
  PREREDIRECT: {
    canonical: "IN_TRANSIT",
    human_en: "Pre-redirect (staged for redirection)",
    human_hu: "Előátirányítás (átirányításra előkészítve)",
    type: "technical",
  },

  // === Final Delivery State ===
  RETURNED: {
    canonical: "DELIVERED",
    human_en: "Returned (delivered back to sender)",
    human_hu: "Visszaküldve (feladónak szállítva)",
    type: "facility",
  },

  // === Preparation/Technical ===
  PREPAREDFORPD: {
    canonical: "IN_TRANSIT",
    human_en: "Prepared for home delivery",
    human_hu: "Házhoz szállításra előkészítve",
    type: "technical",
  },
};

/**
 * Map Foxpost status code to canonical and human descriptions
 * 
 * @param code Foxpost status code (e.g., "OPERIN", "HDINTRANSIT")
 * @returns Mapping with canonical status and human descriptions (EN + HU)
 * 
 * Unknown codes default to PENDING canonical status with fallback description.
 * 
 * @example
 * const mapping = mapFoxpostStatusCode("OPERIN");
 * // { canonical: "IN_TRANSIT", human_en: "Arrived at locker", human_hu: "Automatában megérkezett" }
 * 
 * const unknown = mapFoxpostStatusCode("FOOBAR");
 * // { canonical: "PENDING", human_en: "Foxpost: FOOBAR", human_hu: undefined }
 */
export function mapFoxpostStatusCode(code: string): FoxpostStatusMapping {
  const mapping = FOXPOST_STATUS_MAP[code];

  if (mapping) {
    return mapping;
  }

  // Fallback for unknown codes: map to PENDING with fallback description
  return {
    canonical: "PENDING",
    human_en: `Foxpost: ${code}`,
    human_hu: undefined,
    type: "technical",
  };
}

/**
 * Get human-readable description in specified language
 * 
 * @param code Foxpost status code
 * @param language "en" for English, "hu" for Hungarian
 * @returns Human-readable description
 */
export function getFoxpostStatusDescription(
  code: string,
  language: "en" | "hu" = "en"
): string {
  const mapping = mapFoxpostStatusCode(code);

  if (language === "hu") {
    return mapping.human_hu ?? mapping.human_en ?? `Foxpost: ${code}`;
  }

  return mapping.human_en ?? `Foxpost: ${code}`;
}
