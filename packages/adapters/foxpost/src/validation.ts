import { z } from 'zod';
import type { CreateParcelRequest as CoreCreateParcelRequest, CreateParcelsRequest as CoreCreateParcelsRequest, ParcelStatus } from '@shopickup/core';
import type { Parcel } from '@shopickup/core';

/**
 * Foxpost-specific credentials
 * Supports both API key and basic auth
 * Extends Record<string, unknown> for compatibility with core types
 */
export interface FoxpostCredentials extends Record<string, unknown> {
  apiKey?: string;
  basicUsername?: string;
  basicPassword?: string;
}

/**
 * Foxpost-specific CreateParcelRequest (narrowed credentials)
 */
export interface CreateParcelRequestFoxpost extends CoreCreateParcelRequest {
  credentials: FoxpostCredentials;
}

/**
 * Foxpost-specific CreateParcelsRequest (narrowed credentials)
 */
export interface CreateParcelsRequestFoxpost extends CoreCreateParcelsRequest {
  credentials: FoxpostCredentials;
}

/**
 * Zod schemas for runtime validation
 */

const FoxpostCredentialsSchema = z.object({
  apiKey: z.string().optional(),
  basicUsername: z.string().optional(),
  basicPassword: z.string().optional(),
  // Allow additional properties from core (e.g., username, password as aliases)
  username: z.string().optional(),
  password: z.string().optional(),
}).refine(
  (c) => !!c.apiKey || (!!c.basicUsername && !!c.basicPassword) || (!!c.username && !!c.password),
  {
    message: 'Either apiKey or (basicUsername AND basicPassword) or (username AND password) must be provided',
    path: ['credentials']
  }
);

const ParcelSchema = z.object({
  id: z.string(),
  sender: z.object({
    name: z.string(),
    street: z.string(),
    city: z.string(),
    postalCode: z.string(),
    country: z.string(),
    phone: z.string().optional(),
    email: z.string().email().optional()
  }),
  recipient: z.object({
    name: z.string(),
    street: z.string(),
    city: z.string(),
    postalCode: z.string(),
    country: z.string(),
    phone: z.string().optional(),
    email: z.string().email().optional()
  }),
  weight: z.number().positive(),
  service: z.enum(['standard', 'express', 'economy', 'overnight']),
  reference: z.string().optional(),
  status: z.enum(['draft', 'created', 'closed', 'label_generated', 'shipped', 'delivered', 'exception']).optional()
});

export const CreateParcelRequestFoxpostSchema = z.object({
  parcel: ParcelSchema,
  credentials: FoxpostCredentialsSchema,
  options: z.object({
    useTestApi: z.boolean().optional()
  }).optional()
});

export const CreateParcelsRequestFoxpostSchema = z.object({
  parcels: z.array(ParcelSchema).min(1),
  credentials: FoxpostCredentialsSchema,
  options: z.object({
    useTestApi: z.boolean().optional()
  }).optional()
});

/**
 * Helper to validate and extract credentials from a request
 * Throws ZodError if validation fails
 */
export function validateFoxpostCredentials(credentials: unknown): FoxpostCredentials {
  return FoxpostCredentialsSchema.parse(credentials);
}

/**
 * Helper to validate a CreateParcelRequest
 * Returns parsed and validated request or throws ZodError
 */
export function validateCreateParcelRequest(req: unknown): CreateParcelRequestFoxpost {
  return CreateParcelRequestFoxpostSchema.parse(req);
}

/**
 * Helper to validate a CreateParcelsRequest
 * Returns parsed and validated request or throws ZodError
 */
export function validateCreateParcelsRequest(req: unknown): CreateParcelsRequestFoxpost {
  return CreateParcelsRequestFoxpostSchema.parse(req);
}

/**
 * Helper to safely validate without throwing
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidateCreateParcelRequest(req: unknown) {
  return CreateParcelRequestFoxpostSchema.safeParse(req);
}

export function safeValidateCreateParcelsRequest(req: unknown) {
  return CreateParcelsRequestFoxpostSchema.safeParse(req);
}
