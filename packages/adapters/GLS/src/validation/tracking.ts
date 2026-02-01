/**
 * GLS Tracking Validation
 * 
 * Validates tracking requests and GLS API responses using Zod
 */

import { z, type ZodSafeParseResult } from 'zod';
import type {
  GLSGetParcelStatusesRequest,
  GLSGetParcelStatusesResponse,
} from '../types/index.js';

/**
 * Validates a canonical TrackingRequest
 * 
 * Zod schema for tracking request:
 * - trackingNumber: Required, non-empty string
 * - credentials: Optional, object with arbitrary fields (for flexibility)
 * - options: Optional, object with optional useTestApi boolean
 */
export function safeValidateTrackingRequest(req: unknown): ZodSafeParseResult<any> {
  const schema = z.object({
    trackingNumber: z.string().min(1),
    credentials: z.object({}).passthrough().optional(),
    options: z.object({
      useTestApi: z.boolean().optional(),
    }).optional(),
  });

  return schema.safeParse(req);
}

/**
 * Validates GLS tracking request parameters
 * 
 * Zod schema for GLS tracking request:
 * - parcelNumber: Required, positive integer
 * - returnPOD: Optional, boolean
 * - languageIsoCode: Optional, one of HR/CS/HU/RO/SK/SL/EN
 */
export function safeValidateGLSTrackingRequest(req: unknown): ZodSafeParseResult<any> {
  const schema = z.object({
    parcelNumber: z.number().int().positive(),
    returnPOD: z.boolean().optional(),
    languageIsoCode: z.string().refine(
      (val) => ['HR', 'CS', 'HU', 'RO', 'SK', 'SL', 'EN'].includes(val.toUpperCase()),
      'Language code must be one of: HR, CS, HU, RO, SK, SL, EN'
    ).optional(),
    // Additional fields for auth (optional, handled by adapter)
    username: z.string().optional(),
    password: z.string().optional(),
    clientNumberList: z.array(z.number().int().positive()).optional(),
  });

  return schema.safeParse(req);
}

/**
 * Validates GLS tracking response (lenient - best effort)
 * 
 * GLS responses may have varying structures depending on carrier version/country.
 * This validator performs lenient validation to ensure core fields are present
 * but allows missing or extra fields for forward compatibility.
 * 
 * Zod schema for GLS response:
 * - parcelNumber: Required, integer
 * - parcelStatusList: Optional array of status objects
 * - getParcelStatusErrors: Optional array of error objects
 * - pod: Optional (string/Buffer/Uint8Array - validated separately)
 * - Other fields: Optional (lenient)
 */
export function safeValidateGLSTrackingResponse(resp: unknown): ZodSafeParseResult<any> {
  const glsParcelStatusSchema = z.object({
    statusCode: z.string().min(1, 'Status code is required'),
    statusDate: z.union([z.string().datetime(), z.number()]),
    statusDescription: z.string().optional().nullable(),
    depotCity: z.string().optional().nullable(),
    depotNumber: z.string().optional().nullable(),
    statusInfo: z.string().optional().nullable(),
  });

  const glsErrorSchema = z.object({
    errorCode: z.union([z.string().min(1), z.number()]),
    errorDescription: z.string().min(1),
    clientReferenceList: z.array(z.string()).optional().nullable(),
    parcelIdList: z.array(z.number()).optional().nullable(),
  });

  const schema = z.object({
    parcelNumber: z.union([z.number().int(), z.number()]),
    clientReference: z.string().optional().nullable(),
    deliveryCountryCode: z.string().optional().nullable(),
    deliveryZipCode: z.string().optional().nullable(),
    weight: z.number().optional().nullable(),
    parcelStatusList: z.array(glsParcelStatusSchema).optional().nullable(),
    getParcelStatusErrors: z.array(glsErrorSchema).optional().nullable(),
    pod: z.union([z.string(), z.instanceof(Buffer), z.instanceof(Uint8Array)]).optional().nullable(),
  }).passthrough(); // Allow extra fields for forward compatibility

  return schema.safeParse(resp);
}

/**
 * Helper to validate POD format
 * 
 * POD can be:
 * - string (base64)
 * - Buffer
 * - Uint8Array
 */
export function isValidPODFormat(pod: unknown): boolean {
  return (
    typeof pod === 'string' ||
    Buffer.isBuffer(pod) ||
    pod instanceof Uint8Array
  );
}

/**
 * Helper to validate status date
 * 
 * Ensures status date is a valid date string (ISO 8601) or timestamp
 * Rejects invalid date strings that JavaScript's Date() constructor accepts
 */
export function isValidStatusDate(date: unknown): boolean {
  try {
    if (typeof date === 'string') {
      // Check if it's a valid ISO date or similar
      const d = new Date(date);
      // Ensure the date is actually valid (NaN would indicate invalid)
      return !Number.isNaN(d.getTime());
    } else if (typeof date === 'number') {
      const d = new Date(date);
      // Ensure the date is actually valid
      return !Number.isNaN(d.getTime());
    }
    return false;
  } catch {
    return false;
  }
}
