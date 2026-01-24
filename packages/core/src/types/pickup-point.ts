/**
 * Pickup Point Types
 * 
 * Defines the canonical types for APM (Automated Parcel Machine) / pickup point operations
 * Used for fetching lists of pickup points from carriers (e.g., Foxpost APMs)
 */

/**
 * Common pickup point representation
 * Contains universal fields plus carrier-specific metadata and raw data
 */
export interface PickupPoint {
  /**
   * Unique identifier for this pickup point
   * For Foxpost: operator_id if present, otherwise place_id
   * Should be stable and used as primary key
   */
  id: string;

  /**
   * Provider's native ID (for reference/reconciliation)
   * For Foxpost: place_id or operator_id (whichever was not used as id)
   */
  providerId?: string;

  /**
   * Display name of the pickup point
   */
  name?: string;

  /**
   * ISO 3166-1 alpha-2 country code
   * Example: "hu" for Hungary
   */
  country?: string;

  /**
   * Postal/ZIP code
   */
  postalCode?: string;

  /**
   * City/town name
   */
  city?: string;

  /**
   * Street address with house number
   */
  street?: string;

  /**
   * Complete address as a single string
   * Typically built from street, city, postalCode
   */
  address?: string;

  /**
   * Location hint describing where the pickup point is located
   * Example: "in the courtyard of the building", "inside the store"
   */
  findme?: string;

  /**
   * GPS latitude coordinate
   */
  latitude?: number;

  /**
   * GPS longitude coordinate
   */
  longitude?: number;

  /**
   * Opening hours information
   * Can be a free-form string or structured object
   * For Foxpost: typically an object with day keys (hetfo, kedd, etc.) and time ranges
   */
  openingHours?: string | Record<string, any>;

  /**
   * Contact information
   */
  contact?: {
    phone?: string;
    email?: string;
  };

  /**
   * Whether parcels can be dropped off at this location
   */
  dropoffAllowed?: boolean;

  /**
   * Whether parcels can be picked up at this location
   */
  pickupAllowed?: boolean;

  /**
   * Whether the pickup point is outdoors (true) or indoors (false)
   */
  isOutdoor?: boolean;

  /**
   * Available payment options at this location
   * Examples: "card", "cash", "link", "app"
   */
  paymentOptions?: string[];

  /**
   * Carrier-specific metadata and fields not mapped to standard fields
   * Preserves all carrier-specific information for integrators
   */
  metadata?: Record<string, any>;

  /**
   * Full raw carrier-provided object
   * Preserves complete fidelity of carrier response
   */
  raw?: any;
}

/**
 * Request to fetch pickup points from a carrier
 */
export interface FetchPickupPointsRequest {
  /**
   * Credentials for carrier API (if required)
   * Example: { apiKey: "...", username: "...", password: "..." }
   */
  credentials?: Record<string, unknown>;

  /**
   * Optional filters and query parameters
   */
  options?: {
    /**
     * Filter by country code (ISO 3166-1 alpha-2)
     * Example: "hu" for Hungary
     */
    country?: string;

    /**
     * Filter by geographic bounding box
     */
    bbox?: {
      north: number;
      south: number;
      east: number;
      west: number;
    };

    /**
     * Return only pickup points updated since this date
     */
    updatedSince?: string | Date;

    /**
     * Use test/sandbox API endpoint
     */
    testMode?: boolean;

    /**
     * Custom options for extensibility
     */
    [key: string]: unknown;
  };
}

/**
 * Response from fetching pickup points
 */
export interface FetchPickupPointsResponse {
  /**
   * Array of pickup points
   * May be empty if no matching results
   */
  points: PickupPoint[];

  /**
   * Optional summary information
   */
  summary?: {
    /**
     * Total count of pickup points matching the query
     */
    totalCount?: number;

    /**
     * Timestamp when the data was last updated by the carrier
     */
    updatedAt?: string | Date;
  };

  /**
   * Full raw carrier response
   * Preserved for debugging and carrier-specific analysis
   */
  rawCarrierResponse?: any;
}
