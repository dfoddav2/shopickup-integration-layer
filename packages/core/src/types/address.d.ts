/**
 * Address domain type
 * Represents a physical location (sender or recipient)
 */
export interface Address {
    /** Person or company name */
    name: string;
    /** Street address (no PO boxes by default) */
    street: string;
    /** City or locality */
    city: string;
    /** Postal code / ZIP code (format varies by country) */
    postalCode: string;
    /** ISO 3166-1 alpha-2 country code (e.g., "US", "HU", "DE") */
    country: string;
    /** Phone number (optional) */
    phone?: string;
    /** Email address (optional) */
    email?: string;
    /** Company name (optional, may be separate from name) */
    company?: string;
    /** State / Province / Region (optional) */
    province?: string;
    /** Whether this is a PO Box (optional, default false) */
    isPoBox?: boolean;
}
/**
 * Validate an address has required fields
 */
export declare function validateAddress(addr: unknown): addr is Address;
//# sourceMappingURL=address.d.ts.map