/**
 * GLS country support (ISO 3166-1 alpha-2, uppercase).
 */

/**
 * Countries with a MyGLS ParcelService endpoint (api.mygls.<cc>).
 * Shipment creation, labels and tracking work for these.
 * HU is the primary, tested market; the rest are experimental.
 */
export const GLS_SUPPORTED_COUNTRIES = ['HU', 'CZ', 'HR', 'RO', 'SI', 'SK', 'RS'] as const;

/**
 * Countries available in the public GLS pickup point feed
 * (https://map.gls-hungary.com/data/deliveryPoints/<cc>.json).
 * A superset of GLS_SUPPORTED_COUNTRIES: listing pickup points does not
 * imply shipments can be created for that country.
 */
export const GLS_PICKUP_POINT_COUNTRIES = [
  'AT', 'BE', 'BG', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IT', 'LU', 'NL', 'PL', 'PT', 'RO', 'RS', 'SI', 'SK',
] as const;
