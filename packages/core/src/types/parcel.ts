import type { Address } from './address.js';

/**
 * Parcel domain type
 * A self-contained physical container with full shipping details
 * Each parcel is independent and includes all necessary addressing information.
 */
export interface Parcel {
  /** Internal unique identifier */
  id: string;

  /** Sender address */
  sender: Address;

  /** Recipient address */
  recipient: Address;

  /** Maps carrier ID -> carrier's parcel ID */
  carrierIds?: Record<string, string>;

  /** Weight in grams */
  weight: number;

  /** Dimensions (optional) */
  dimensions?: {
    length: number; // centimeters
    width: number; // centimeters
    height: number; // centimeters
  };

  /** Normalized service level (standard, express, economy, overnight) */
  service: "standard" | "express" | "economy" | "overnight";

  /** Customer reference (e.g., order ID, invoice number) */
  reference?: string;

  /** Items contained in this parcel (optional) */
  items?: ParcelItem[];

  /** Current status of the parcel */
  status?: ParcelStatus;

  /** Arbitrary metadata */
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
