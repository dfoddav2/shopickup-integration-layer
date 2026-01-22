/**
 * Money domain type
 * Represents a monetary amount with currency
 */

export interface Money {
  /** Amount in smallest currency unit (e.g., cents for USD, fillér for HUF) */
  amount: number;

  /** ISO 4217 currency code (e.g., "USD", "HUF", "EUR") */
  currency: string;
}
