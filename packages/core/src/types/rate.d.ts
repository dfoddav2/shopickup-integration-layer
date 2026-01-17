/**
 * Rate domain type
 * Available shipping option with pricing
 */
export interface Rate {
    /** Service name/code (e.g., "standard", "express", "overnight") */
    service: string;
    /** Which carrier offers this rate */
    carrier: string;
    /** Price in smallest currency unit (e.g., cents for USD, fillér for HUF) */
    price: number;
    /** ISO 4217 currency code (e.g., "USD", "HUF", "EUR") */
    currency: string;
    /** Estimated delivery time in business days (optional) */
    estimatedDays?: number;
    /** Additional metadata (carrier-specific) */
    metadata?: Record<string, unknown>;
}
/**
 * Rates response
 */
export interface RatesResponse {
    /** List of available rates */
    rates: Rate[];
    /** When these rates expire (optional) */
    expiresAt?: Date;
    /** Raw carrier response for debugging */
    raw?: unknown;
}
//# sourceMappingURL=rate.d.ts.map