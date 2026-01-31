/**
 * GLS Authentication Utilities
 * 
 * Handles SHA512 password hashing for GLS MyGLS API authentication.
 * 
 * IMPORTANT: GLS uses JSON body authentication, NOT HTTP Basic Auth!
 * The password must be converted to a byte array (not hex string).
 * See: php_rest_client.php line 27
 */

import { createHash } from 'crypto';

/**
 * Computes SHA512 hash of a password and returns as byte array
 * 
 * GLS API expects the password as a JSON array of bytes, not a hex string.
 * The byte array format allows JSON serialization of the hash.
 * 
 * This matches the GLS PHP example:
 * $password = "[".implode(',',unpack('C*', hash('sha512', $pwd, true)))."]";
 * 
 * @param password Plain text password
 * @returns SHA512 hash as array of bytes (0-255 values)
 * 
 * @example
 * const password = "myPassword";
 * const hashBytes = hashPasswordSHA512(password);
 * // hashBytes = [194, 106, 210, 194, 150, 116, 76, ...]
 * // This gets serialized as JSON: [194, 106, 210, 194, ...]
 */
export function hashPasswordSHA512(password: string): number[] {
  // Compute SHA512 hash as raw bytes (binary output)
  const hash = createHash('sha512').update(password).digest();
  
  // Convert each byte to a number (0-255)
  const byteArray: number[] = [];
  for (let i = 0; i < hash.length; i++) {
    byteArray.push(hash[i]);
  }
  
  return byteArray;
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
