/**
 * GLS Mappers
 * 
 * Transforms between canonical Shopickup types and GLS-specific formats
 */

import type { PickupPoint } from '@shopickup/core';
import { buildOpeningHours, WEEKDAY_NAMES } from '@shopickup/core';
import type { GLSDeliveryPoint } from '../types/index.js';

// Re-export parcel mappers
export * from './parcels.js';

/**
 * Parses GLS hours array into the canonical opening-hours format.
 *
 * GLS hours tuples are `[weekday, from, to]` where weekday is 1-7
 * (1=Monday, 7=Sunday) and times are "HH:MM". A 4+ element tuple adds a
 * lunch break: `[weekday, from, to, lunch_start, lunch_end]`, which is
 * represented as a split shift (e.g. "09:00 - 11:00, 14:00 - 18:00").
 * Entries with null times (closed that day) are skipped.
 *
 * @param hours Array of [weekday, from, to, ...] tuples
 * @returns Canonical opening-hours map keyed by English weekday, or undefined
 */
function parseGLSHours(
  hours: Array<[weekday: number, from: string | null, to: string | null, ...rest: any[]]>
): Record<string, string> | undefined {
  if (!hours || hours.length === 0) {
    return undefined;
  }

  // GLS uses 1-based weekday indexing: 1=Monday, 7=Sunday
  const entries: Record<string, Array<{ from: string; to: string }>> = {};

  for (const entry of hours) {
    if (!entry || entry.length < 3) {
      continue;
    }

    const [weekday, from, to] = entry;
    const dayName = WEEKDAY_NAMES[weekday - 1];
    if (!dayName) continue;

    // Skip entries where times are null or undefined (closed that day)
    if (from === null || to === null || from === undefined || to === undefined) {
      continue;
    }

    const intervals = entries[dayName] || (entries[dayName] = []);

    // Lunch break tuples carry [weekday, from, to, lunch_start, lunch_end].
    // Represent the day as a split shift across the lunch closure.
    const lunchStart = entry[3];
    const lunchEnd = entry[4];
    if (lunchStart && lunchEnd) {
      intervals.push({ from, to: lunchStart });
      intervals.push({ from: lunchEnd, to });
    } else {
      intervals.push({ from, to });
    }
  }

  return buildOpeningHours(entries);
}

/**
 * Determines if pickup is allowed based on GLS features
 * 
 * GLS features include: pickup, delivery, acceptsCash, acceptsCard
 */
function isPickupAllowed(features: string[]): boolean {
  return features.includes('pickup');
}

/**
 * Determines if dropoff is allowed based on GLS features
 */
function isDropoffAllowed(features: string[]): boolean {
  return features.includes('delivery');
}

/**
 * Maps a GLS DeliveryPoint to canonical PickupPoint
 * 
 * @param point GLS delivery point from the public feed
 * @param country ISO 3166-1 alpha-2 country code (lowercase)
 * @returns Canonical PickupPoint
 */
export function mapGLSDeliveryPointToPickupPoint(
  point: GLSDeliveryPoint,
  country: string
): PickupPoint {
  const [latitude, longitude] = point.location;

  // Build full address string
  const address = `${point.contact.address}, ${point.contact.postalCode} ${point.contact.city}`;

  // Parse payment options from features
  const paymentOptions: string[] = [];
  if (point.features.includes('acceptsCash')) {
    paymentOptions.push('cash');
  }
  if (point.features.includes('acceptsCard')) {
    paymentOptions.push('card');
  }

  // Determine if it's a parcel locker
  const isLocker = point.type === 'parcel-locker' || point.type.toLowerCase().includes('locker');

  return {
    id: point.id,
    providerId: point.externalId || point.goldId?.toString(),
    name: point.name,
    country: country.toLowerCase(),
    postalCode: point.contact.postalCode,
    city: point.contact.city,
    street: point.contact.address,
    address: address,
    latitude: latitude,
    longitude: longitude,
    openingHours: parseGLSHours(point.hours),
    contact: point.contact.phone
      ? {
          phone: point.contact.phone,
          email: point.contact.web,
        }
      : undefined,
    pickupAllowed: isPickupAllowed(point.features),
    dropoffAllowed: isDropoffAllowed(point.features),
    isOutdoor: isLocker,
    paymentOptions: paymentOptions.length > 0 ? paymentOptions : undefined,
    metadata: {
      glsType: point.type,
      glsDescription: point.description,
      hasWheelchairAccess: point.hasWheelchairAccess,
      lockerSaturation: point.lockerSaturation,
      glsFeatures: point.features,
    },
    raw: point,
  };
}

/**
 * Maps an array of GLS DeliveryPoints to canonical PickupPoints
 */
export function mapGLSDeliveryPointsToPickupPoints(
  points: GLSDeliveryPoint[],
  country: string
): PickupPoint[] {
  return points.map((point) => mapGLSDeliveryPointToPickupPoint(point, country));
}
