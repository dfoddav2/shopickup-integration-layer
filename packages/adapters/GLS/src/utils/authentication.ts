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

/**
 * Convert PascalCase object keys to camelCase from GLS API responses
 * 
 * The GLS API returns PascalCase keys (ParcelNumber, ParcelStatusList, etc.)
 * but our types use camelCase. This helper converts at deserialization time.
 * 
 * @param obj Object with PascalCase keys
 * @returns New object with camelCase keys
 */
export function convertFromPascalCase(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Don't convert Buffers, Uint8Arrays, or other special types
  if (Buffer.isBuffer(obj) || obj instanceof Uint8Array || obj instanceof Date) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays recursively
  if (Array.isArray(obj)) {
    return obj.map(item => convertFromPascalCase(item));
  }

  // Convert object keys
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Convert first letter to lowercase (PascalCase → camelCase)
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    
    // Recursively convert nested objects
    result[camelKey] = 
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? convertFromPascalCase(value)
        : Array.isArray(value)
        ? (value as unknown[]).map(item => convertFromPascalCase(item))
        : value;
  }
  
  return result;
}

/**
 * Known GLS acronyms that must remain fully uppercase in PascalCase conversion.
 * These appear as lowercase prefixes in camelCase keys (e.g., 'psdParameter')
 * and must be converted to all-caps (e.g., 'PSDParameter') for the GLS API.
 * 
 * The GLS API (a .NET service) uses case-sensitive property matching and expects
 * acronyms like PSD, COD, FDS, etc. to remain uppercase. A naive first-letter
 * uppercase conversion (e.g., 'PsdParameter') would be rejected by the API.
 * 
 * Derived from GLS API spec and PHP reference example:
 * - Service parameters: PSDParameter, FDSParameter, FSSParameter, etc.
 * - Parcel fields: CODAmount, CODCurrency, CODReference
 */
const GLS_ACRONYMS = [
  'psd', 'cod', 'adr', 'aos', 'cs1', 'dds', 'dpv', 'fds',
  'fss', 'ins', 'mmp', 'sds', 'sm1', 'sm2', 'szl',
];

/**
 * Converts a single camelCase key to PascalCase, preserving known GLS acronyms.
 * 
 * Examples:
 *   psdParameter  → PSDParameter  (acronym prefix, fully uppercased)
 *   codAmount     → CODAmount     (acronym prefix, fully uppercased)
 *   zipCode       → ZipCode       (no known acronym, simple first-letter upcase)
 *   username      → Username      (single word, simple first-letter upcase)
 * 
 * @param key camelCase key (e.g., 'psdParameter')
 * @returns PascalCase key (e.g., 'PSDParameter')
 */
function camelToPascalKey(key: string): string {
  for (const acronym of GLS_ACRONYMS) {
    if (key.startsWith(acronym) && key.length > acronym.length) {
      const nextChar = key[acronym.length];
      if (nextChar === nextChar.toUpperCase()) {
        return acronym.toUpperCase() + key.slice(acronym.length);
      }
    }
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Convert camelCase object keys to PascalCase for GLS API requests
 * 
 * The GLS API expects PascalCase keys (Username, Password, ParcelList, etc.)
 * but TypeScript types use camelCase. This helper converts at serialization time.
 * 
 * Also handles known GLS acronyms (PSD, COD, FDS, etc.) that must remain
 * fully uppercase in PascalCase keys. A naive first-letter-only conversion
 * would produce 'PsdParameter' which the GLS API rejects with error code 13
 * ("Invalid service parameter, Service 'PSD'").
 * 
 * @param obj Object with camelCase keys
 * @returns New object with PascalCase keys
 */
export function convertToPascalCase(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays recursively
  if (Array.isArray(obj)) {
    return obj.map(item => 
      typeof item === 'object' ? convertToPascalCase(item) : item
    );
  }

  // Convert object keys
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const pascalKey = camelToPascalKey(key);
    
    // Recursively convert nested objects
    result[pascalKey] = 
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? convertToPascalCase(value as Record<string, any>)
        : Array.isArray(value)
        ? (value as any[]).map(item =>
            typeof item === 'object' ? convertToPascalCase(item) : item
          )
        : value;
  }
  
  return result;
}
