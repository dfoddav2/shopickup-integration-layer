/**
 * Delivery domain type
 * Discriminated union representing where and how a parcel is delivered
 */

import type { Address } from './address.js';

/**
 * Home delivery: parcel shipped to a street address
 */
export interface HomeDelivery {
  method: 'HOME';

  /** Full recipient address */
  address: Address;

  /** Special delivery instructions (e.g., door code, leave-at-porch) */
  instructions?: string;
}

/**
 * Pickup point delivery: parcel shipped to a locker, shop, or pickup location
 */
export interface PickupPointDelivery {
  method: 'PICKUP_POINT';

  /** Pickup point location details */
  pickupPoint: {
    /** Unique identifier for the pickup point (e.g., Foxpost destination code) */
    id: string;

    /** Provider/carrier code (optional; "foxpost", "dhl", etc.) */
    provider?: string;

    /** Human-readable name of the pickup point */
    name?: string;

    /** Address of the pickup point (optional but useful for UI/labels) */
    address?: Address;

    /** Type of pickup point */
    type?: 'LOCKER' | 'SHOP' | 'POST_OFFICE' | 'OTHER';
  };

  /** Special delivery instructions */
  instructions?: string;
}

/**
 * Delivery is a discriminated union: either HOME or PICKUP_POINT
 */
export type Delivery = HomeDelivery | PickupPointDelivery;
