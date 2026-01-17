import type { Address } from "./address";

/**
 * Shipment domain type
 * Represents a single physical mailing from shipper to recipient
 */
export interface Shipment {
  /** Internal unique identifier */
  id: string;

  /** Maps carrier ID -> carrier's shipment ID (for tracking) */
  carrierIds?: Record<string, string>;

  /** Sender address */
  sender: Address;

  /** Recipient address */
  recipient: Address;

  /** Normalized service level */
  service: "standard" | "express" | "economy" | "overnight";

  /** Customer reference (e.g., order ID, invoice number) */
  reference?: string;

  /** Package dimensions (optional) */
  dimensions?: {
    length: number; // centimeters
    width: number; // centimeters
    height: number; // centimeters
  };

  /** Total weight in grams */
  totalWeight: number;

  /** Arbitrary metadata (carrier-specific or integrator-specific) */
  metadata?: Record<string, unknown>;

  /** When this shipment was created */
  createdAt: Date;

  /** Last update time */
  updatedAt: Date;
}
