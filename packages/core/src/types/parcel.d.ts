/**
 * Parcel domain type
 * A physical container within a shipment
 */
export interface Parcel {
    /** Internal unique identifier */
    id: string;
    /** Reference to parent shipment */
    shipmentId: string;
    /** Maps carrier ID -> carrier's parcel ID */
    carrierIds?: Record<string, string>;
    /** Weight in grams */
    weight: number;
    /** Dimensions (optional) */
    dimensions?: {
        length: number;
        width: number;
        height: number;
    };
    /** Items contained in this parcel (optional) */
    items?: ParcelItem[];
    /** Current status of the parcel */
    status: ParcelStatus;
    /** Arbitrary metadata */
    metadata?: Record<string, unknown>;
    /** When created */
    createdAt?: Date;
    /** Last update */
    updatedAt?: Date;
}
export type ParcelStatus = "draft" | "created" | "closed" | "label_generated" | "shipped" | "delivered" | "exception";
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
//# sourceMappingURL=parcel.d.ts.map