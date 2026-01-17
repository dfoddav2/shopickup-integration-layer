/**
 * Label domain type
 * A generated shipping label that can be printed
 */
export interface Label {
  /** Internal unique identifier */
  id: string;

  /** Reference to the parcel this label is for */
  parcelId: string;

  /** Carrier-assigned tracking number */
  trackingNumber: string;

  /** Which carrier issued this label */
  carrier: string;

  /** URL to the label (PDF or image) - optional if labelData is provided */
  labelUrl?: string;

  /** Raw label data (PDF bytes, ZPL code, etc.) - optional if labelUrl is provided */
  labelData?: Buffer;

  /** When the label was generated */
  createdAt: Date;

  /** When the label expires (optional - some carriers' labels expire) */
  expiresAt?: Date;

  /** Additional metadata */
  metadata?: {
    /** Label format: PDF, PNG, ZPL, etc. */
    format?: "PDF" | "PNG" | "ZPL" | "TEXT";

    /** Whether this is a return label */
    returnLabel?: boolean;

    /** Size of the label in the format specified */
    size?: "4x6" | "5x7" | "6x4" | "custom";

    /** Other carrier-specific metadata */
    [key: string]: unknown;
  };
}
