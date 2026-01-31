/**
 * GLS Authentication Utilities
 * 
 * Handles HTTP Basic Auth header creation with SHA512 password hashing
 * for GLS MyGLS API authentication.
 */

import { createHash } from 'crypto';

/**
 * Creates HTTP Basic Authentication header for GLS API
 * 
 * GLS uses HTTP Basic auth where the password must be SHA512-hashed BEFORE
 * being base64-encoded for the Authorization header.
 * 
 * @param username MyGLS email address
 * @param sha512PasswordHash SHA512-hashed password (hex string or buffer)
 * @returns Object with Authorization header ready for HTTP request
 * 
 * @example
 * const password = "myPassword";
 * const hashedPassword = hashPasswordSHA512(password);
 * const headers = createGLSAuthHeader("user@example.com", hashedPassword);
 * // headers.Authorization = "Basic dXNlckBleGFtcGxlLmNvbTpjMjZhZDJjMjk2NzQ0..."
 */
export function createGLSAuthHeader(
  username: string,
  sha512PasswordHash: string
): Record<string, string> {
  // Create Basic auth credentials: "username:password"
  const credentials = `${username}:${sha512PasswordHash}`;
  
  // Encode to base64
  const base64Credentials = Buffer.from(credentials).toString('base64');
  
  return {
    Authorization: `Basic ${base64Credentials}`,
  };
}

/**
 * Computes SHA512 hash of a password
 * 
 * The password must be hashed using SHA512 algorithm.
 * Returns the hex string representation of the hash.
 * 
 * @param password Plain text password
 * @returns SHA512 hash as hex string
 * 
 * @example
 * const password = "myPassword";
 * const hash = hashPasswordSHA512(password);
 * // hash = "c26ad2c2967442c6f80c1b5a2d0e5c8a..."
 */
export function hashPasswordSHA512(password: string): string {
  return createHash('sha512').update(password).digest('hex');
}

/**
 * Determines the GLS API base URL based on country and environment
 * 
 * IMPORTANT: This adapter is HU-specific. Other countries are listed for reference
 * but may require additional configuration or validation.
 * 
 * Supported countries:
 * - HU (Hungary) - Primary/tested
 * - CZ (Czech Republic) - Secondary support
 * - HR (Croatia) - Secondary support
 * - RO (Romania) - Secondary support
 * - SI (Slovenia) - Secondary support
 * - SK (Slovakia) - Secondary support
 * - RS (Serbia) - Secondary support
 * 
 * @param country ISO 3166-1 alpha-2 country code (uppercase or lowercase)
 * @param useTestApi If true, uses test API endpoint; otherwise production
 * @returns Base URL for GLS MyGLS API
 * @throws Error if country is not supported
 * 
 * @example
 * const prodUrl = resolveGLSBaseUrl("HU", false);
 * // "https://api.mygls.hu/ParcelService.svc"
 * 
 * const testUrl = resolveGLSBaseUrl("hu", true);
 * // "https://api.test.mygls.hu/ParcelService.svc"
 */
export function resolveGLSBaseUrl(
  country: string,
  useTestApi: boolean = false
): string {
  const countryCode = country.toUpperCase();
  
  // Validate country is supported
  const supportedCountries = ['HU', 'CZ', 'HR', 'RO', 'SI', 'SK', 'RS'];
  if (!supportedCountries.includes(countryCode)) {
    throw new Error(
      `Unsupported country: ${countryCode}. Supported countries: ${supportedCountries.join(', ')}`
    );
  }
  
  const countryLower = countryCode.toLowerCase();
  const env = useTestApi ? 'test.' : '';
  
  return `https://api.${env}mygls.${countryLower}/ParcelService.svc`;
}

/**
 * Credentials object for GLS API authentication
 * 
 * This is used internally by the adapter to store credentials
 * passed from the integrator.
 */
export interface GLSCredentials {
  username: string; // MyGLS email
  password: string; // Plain text password (will be hashed by adapter)
  clientNumberList: number[]; // GLS account numbers to operate on
  webshopEngine?: string; // Optional identifier
}

/**
 * Validates GLS credentials
 * 
 * @param creds Credentials to validate
 * @throws Error if credentials are invalid
 */
export function validateGLSCredentials(creds: GLSCredentials): void {
  if (!creds.username || typeof creds.username !== 'string') {
    throw new Error('Invalid or missing username');
  }
  
  if (!creds.password || typeof creds.password !== 'string') {
    throw new Error('Invalid or missing password');
  }
  
  if (!Array.isArray(creds.clientNumberList) || creds.clientNumberList.length === 0) {
    throw new Error('Invalid or empty clientNumberList');
  }
  
  // Validate each client number is a positive integer
  for (const clientNum of creds.clientNumberList) {
    if (!Number.isInteger(clientNum) || clientNum <= 0) {
      throw new Error(`Invalid client number: ${clientNum}`);
    }
  }
}
