import type { Address } from './address.js';
import type { Contact } from './contact.js';
import type { Delivery } from './delivery.js';
import type { Money } from './money.js';

/**
 * Parcel domain type
 * A self-contained physical container with complete shipping details.
 * Includes shipper and recipient information, package details, and carrier-independent options (COD, fragility, etc.).
 */
export interface Parcel {
  /** Internal unique identifier */
  id: string;

  /** Shipper/sender information (from where the parcel originates) */
  shipper: {
    contact: Contact;
    address: Address;
  };

  /** Recipient information (where the parcel goes) */
  recipient: {
    contact: Contact;
    delivery: Delivery; // Either HOME or PICKUP_POINT, discriminated
  };

  /** Maps carrier ID -> carrier's parcel ID (for tracking/reference) */
  carrierIds?: Record<string, string>;

  /** Normalized service level (standard, express, economy, overnight) */
  service: "standard" | "express" | "economy" | "overnight";

  /**
   * Optional carrier-specific service code
   * Some carriers expose explicit product codes (e.g., "FOX-HD", "DHL-EXPRESS")
   * Adapter may use this as a passthrough if integrator knows the exact code
   */
  carrierServiceCode?: string;

  /** Package physical details */
  package: {
    /** Weight in grams */
    weightGrams: number;

    /** Dimensions (optional) */
    dimensionsCm?: {
      length: number;
      width: number;
      height: number;
    };
  };

  /** Special handling requirements */
  handling?: {
    /** Parcel contains fragile items */
    fragile?: boolean;

    /** Parcel contains perishable items (food, ice, etc.) */
    perishables?: boolean;

    /** Battery classification for dangerous goods */
    batteries?: "NONE" | "LITHIUM_ION" | "LITHIUM_METAL";
  };

  /** Cash on delivery (COD) amount (optional) */
  cod?: {
    amount: Money;
    reference?: string; // For COD payment reference
  };

  /** Declared value for customs/insurance purposes (optional) */
  declaredValue?: Money;

  /** Insurance coverage (separate from declared value, optional) */
  insurance?: {
    amount: Money;
  };

  /** Reference codes for tracking and reconciliation */
  references?: {
    /** Customer/order ID */
    orderId?: string;

    /** Integrator-specific reference (e.g., invoice number) */
    customerReference?: string;
  };

  /** Items contained in this parcel (optional) */
  items?: ParcelItem[];

  /** Current status of the parcel */
  status?: ParcelStatus;

  /** Arbitrary metadata (carrier-specific or integrator-specific quirks) */
  metadata?: Record<string, unknown>;

  /** When created */
  createdAt?: Date;

  /** Last update */
  updatedAt?: Date;
}

export type ParcelStatus =
  | "draft"           // Not yet submitted to carrier
  | "created"         // Carrier has acknowledged the parcel
  | "closed"          // Parcel closed (ready for labeling)
  | "label_generated" // Label created
  | "shipped"         // In transit
  | "delivered"       // Delivered to recipient
  | "exception";      // Exception/problem during delivery

/**
 * Item within a parcel
 */
export interface ParcelItem {
  /** SKU or product code (optional) */
  sku?: string;

  /** Quantity */
  quantity: number;

  /** Human-readable description */
  description?: string;

  /** Weight in grams (optional) */
  weight?: number;

  /** Other metadata */
  metadata?: Record<string, unknown>;
}
