import { z } from 'zod';
import type { CreateParcelRequest as CoreCreateParcelRequest, CreateParcelsRequest as CoreCreateParcelsRequest } from '@shopickup/core';
import type { Parcel } from '@shopickup/core';

/**
 * Foxpost-specific credentials
 * Requires both API key and basic auth together
 * Extends Record<string, unknown> for compatibility with core types
 */
export interface FoxpostCredentials extends Record<string, unknown> {
  apiKey: string;
  basicUsername: string;
  basicPassword: string;
}

/**
 * Zod schemas for runtime validation
 */

/**
 * Money schema (ISO currency amount in smallest unit)
 */
const MoneySchema = z.object({
  amount: z.number().int().nonnegative().describe('Amount must be non-negative'),
  currency: z.string().length(3).describe('Currency must be ISO 4217 code (3 chars)'),
});

/**
 * Contact schema (phone/email optional)
 */
const ContactSchema = z.object({
  name: z.string().min(1).describe('Name is required'),
  phone: z.string().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
});

/**
 * Address schema (full shipping address)
 */
const AddressSchema = z.object({
  name: z.string().min(1).describe('Address name is required'),
  street: z.string().min(1).describe('Street is required'),
  city: z.string().min(1).describe('City is required'),
  postalCode: z.string().min(1).describe('Postal code is required'),
  country: z.string().min(1).describe('Country is required'),
  phone: z.string().optional(),
  email: z.email().optional(),
  company: z.string().optional(),
  province: z.string().optional(),
  isPoBox: z.boolean().optional(),
});

/**
 * Home delivery schema
 */
const HomeDeliverySchema = z.object({
  method: z.literal('HOME'),
  address: AddressSchema,
  instructions: z.string().optional(),
});

/**
 * Pickup point delivery schema
 */
const PickupPointDeliverySchema = z.object({
  method: z.literal('PICKUP_POINT'),
  pickupPoint: z.object({
    id: z.string().min(1, 'Pickup point ID is required'),
    provider: z.string().optional(),
    name: z.string().optional(),
    address: AddressSchema.optional(),
    type: z.enum(['LOCKER', 'SHOP', 'POST_OFFICE', 'OTHER']).optional(),
  }),
  instructions: z.string().optional(),
});

/**
 * Delivery discriminated union
 */
const DeliverySchema = z.discriminatedUnion('method', [
  HomeDeliverySchema,
  PickupPointDeliverySchema,
]);

/**
 * Parcel schema (canonical domain type)
 */
const ParcelSchema = z.object({
  id: z.string().min(1),
  shipper: z.object({
    contact: ContactSchema,
    address: AddressSchema,
  }),
  recipient: z.object({
    contact: ContactSchema,
    delivery: DeliverySchema,
  }),
  carrierIds: z.record(z.string(), z.string()).optional(),
  service: z.enum(['standard', 'express', 'economy', 'overnight']),
  carrierServiceCode: z.string().optional(),
  package: z.object({
    weightGrams: z.number().gt(0),
    dimensionsCm: z.object({
      length: z.number().gt(0),
      width: z.number().gt(0),
      height: z.number().gt(0),
    }).optional(),
  }),
  handling: z.object({
    fragile: z.boolean().optional(),
    perishables: z.boolean().optional(),
    batteries: z.enum(['NONE', 'LITHIUM_ION', 'LITHIUM_METAL']).optional(),
  }).optional(),
  cod: z.object({
    amount: MoneySchema,
    reference: z.string().optional(),
  }).optional(),
  declaredValue: MoneySchema.optional(),
  insurance: z.object({
    amount: MoneySchema,
  }).optional(),
  references: z.object({
    orderId: z.string().optional(),
    customerReference: z.string().optional(),
  }).optional(),
  items: z.array(z.object({
    sku: z.string().optional(),
    quantity: z.number().gt(0),
    description: z.string().optional(),
    weight: z.number().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
  status: z.enum(['draft', 'created', 'closed', 'label_generated', 'shipped', 'delivered', 'exception']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
}).strict();

/**
 * Foxpost package size schema (used in both HD and APM)
 */
const FoxpostPackageSizeSchema = z.enum(['XS', 'S', 'M', 'L', 'XL', '1', '2', '3', '4', '5']);

export type FoxpostPackageSize = z.infer<typeof FoxpostPackageSizeSchema>;

/**
 * Hungarian phone number schema (mobile only, +36 or 36 prefix)
 */
const HungarianPhoneSchema = z.string().regex(
  /^(\+36|36)(20|30|31|70|50|51)\d{7}$/,
  'Phone must be Hungarian mobile'
);

/**
 * Credentials schema - requires apiKey, basicUsername, and basicPassword all together
 */
const FoxpostCredentialsSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  basicUsername: z.string().min(1, 'Basic auth username is required'),
  basicPassword: z.string().min(1, 'Basic auth password is required'),
}).strict();

/**
 * Home Delivery parcel schema with discriminator
 */
const FoxpostParcelHDSchema = z.object({
  type: z.literal('HD'),
  cod: z.number().int().min(0).max(1000000).optional().default(0),
  comment: z.string().max(50).optional(),
  deliveryNote: z.string().optional(),
  fragile: z.boolean().optional().default(false),
  label: z.boolean().optional(),
  recipientAddress: z.string().min(1).max(150),
  recipientCity: z.string().min(1).max(50),
  recipientCountry: z.string().optional(),
  recipientEmail: z.email(),
  recipientName: z.string().min(1).max(150),
  recipientPhone: HungarianPhoneSchema,
  recipientZip: z.string().min(1).max(4),
  refCode: z.string().max(30).optional(),
  size: FoxpostPackageSizeSchema,
}).strict();

/**
 * APM (Automated Parcel Machine) parcel schema with discriminator
 */
const FoxpostParcelAPMSchema = z.object({
  type: z.literal('APM'),
  cod: z.number().int().min(0).max(1000000).optional().default(0),
  comment: z.string().max(50).optional(),
  destination: z.string().min(1),
  label: z.boolean().optional(),
  recipientEmail: z.email(),
  recipientName: z.string().min(1).max(150),
  recipientPhone: HungarianPhoneSchema,
  refCode: z.string().max(30).optional(),
  size: FoxpostPackageSizeSchema,
  uniqueBarcode: z.string().min(4).max(20).regex(/^(?=.*[a-zA-Z].*[a-zA-Z].*[a-zA-Z].*[a-zA-Z])(?=.*\d.*\d.*\d.*\d)/).optional(),
}).strict();

/**
 * Discriminated union of HD and APM parcel types
 */
export const FoxpostParcelSchema = z.discriminatedUnion('type', [
  FoxpostParcelHDSchema,
  FoxpostParcelAPMSchema
]);

/**
 * Exported types inferred from Zod schemas (single source of truth)
 */
export type FoxpostParcel = z.infer<typeof FoxpostParcelSchema>;
export type FoxpostParcelHD = z.infer<typeof FoxpostParcelHDSchema>;
export type FoxpostParcelAPM = z.infer<typeof FoxpostParcelAPMSchema>;

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
 * CreateParcelRequest Zod schema
 */
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

export const CreateLabelRequestFoxpostSchema = z.object({
  parcelCarrierId: z.string().min(1, 'Parcel carrier ID is required'),
  credentials: FoxpostCredentialsSchema,
  options: z.object({
    useTestApi: z.boolean().optional(),
    size: z.enum(['A6', 'A7', '_85X85']).default('A7'),
    startPos: z.number().int().min(1).max(7).optional(),
    isPortrait: z.boolean().optional().default(false),
  }).optional()
});

/**
 * Batch label request schema
 * Similar to CreateParcelsRequest but for labels
 */
export const CreateLabelsRequestFoxpostSchema = z.object({
  parcelCarrierIds: z.array(z.string().min(1)).min(1, 'At least one parcel ID is required'),
  credentials: FoxpostCredentialsSchema,
  options: z.object({
    useTestApi: z.boolean().optional(),
    size: z.enum(['A6', 'A7', '_85X85']).default('A7'),
    startPos: z.number().int().min(1).max(7).optional(),
    isPortrait: z.boolean().optional().default(false),
  }).optional()
});

/**
 * Foxpost-specific TrackingRequest (narrowed credentials)
 */
export interface TrackingRequestFoxpost {
  trackingNumber: string;
  credentials: FoxpostCredentials;
  options?: {
    useTestApi?: boolean;
  };
}

/**
 * TrackingRequest Zod schema
 */
export const TrackingRequestFoxpostSchema = z.object({
  trackingNumber: z.string().min(1, 'Tracking number is required'),
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
 * Helper to safely validate credentials without throwing
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidateFoxpostCredentials(credentials: unknown) {
  return FoxpostCredentialsSchema.safeParse(credentials);
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


/**
 * Helper to safely validate a CreateLabelRequest without throwing
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidateCreateLabelRequest(req: unknown) {
  return CreateLabelRequestFoxpostSchema.safeParse(req);
}

/**
 * Helper to safely validate a CreateLabelsRequest without throwing
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidateCreateLabelsRequest(req: unknown) {
  return CreateLabelsRequestFoxpostSchema.safeParse(req);
}

/**
 * Helper to safely validate a TrackingRequest without throwing
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidateTrackingRequest(req: unknown) {
  return TrackingRequestFoxpostSchema.safeParse(req);
}

/**
 * Validate a Foxpost parcel payload (after mapping from canonical Parcel)
 * Used to catch mapping errors before sending to the carrier
 */
export function validateFoxpostParcel(parcel: unknown): FoxpostParcel {
  return FoxpostParcelSchema.parse(parcel);
}

/**
 * Safely validate a Foxpost parcel payload without throwing
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidateFoxpostParcel(parcel: unknown) {
  return FoxpostParcelSchema.safeParse(parcel);
}
