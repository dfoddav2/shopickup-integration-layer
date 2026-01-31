/**
 * GLS Adapter Types
 * 
 * Type definitions for GLS-specific data structures.
 * GLS serves Hungary and Eastern Europe (AT, BE, BG, CZ, DE, DK, ES, FI, FR, GR, HR, HU, IT, LU, NL, PL, PT, RO, SI, SK, RS)
 */

/**
 * GLS Delivery Point (from public pickup points feed)
 * Represents a parcel shop, locker, or delivery location
 */
export interface GLSDeliveryPoint {
  id: string;
  goldId?: number;
  name: string;
  description?: string;
  contact: {
    countryCode: string;
    postalCode: string;
    city: string;
    address: string;
    web?: string;
    phone?: string;
  };
  location: [latitude: number, longitude: number];
  hours: Array<[weekday: number, from: string | null, to: string | null, ...rest: any[]]>;
  features: string[];
  type: string;
  externalId?: string;
  lockerSaturation?: string;
  hasWheelchairAccess: boolean;
}

/**
 * GLS Delivery Points Feed Response
 * Structure returned from the public GLS pickup points endpoint
 */
export interface GLSDeliveryPointsFeed {
  items: GLSDeliveryPoint[];
}

/**
 * Resolved base URL and country code info for GLS operations
 */
export interface GLSUrlConfig {
  baseUrl: string;
  country: string;
}
