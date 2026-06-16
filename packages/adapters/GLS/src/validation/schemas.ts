/**
 * Shared GLS validation schemas and types
 *
 * Reusable by parcel-creation, label-creation, and print-labels flows
 * so that option shapes stay in sync and core contract types are properly extended.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export const GLSCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
  clientNumberList: z.array(z.number()).min(1),
  webshopEngine: z.string().optional(),
});

export type GLSCredentials = z.infer<typeof GLSCredentialsSchema>;

// ---------------------------------------------------------------------------
// Printer type enum (shared by label + print-labels flows)
// ---------------------------------------------------------------------------

export const PrinterTypeEnum = z.enum([
  'A4_2x2',
  'A4_4x1',
  'Connect',
  'Thermo',
  'ThermoZPL',
  'ShipItThermoPdf',
  'ThermoZPL_300DPI',
]);

// ---------------------------------------------------------------------------
// Carrier-level options (for create-parcel / PrepareLabels flow)
// ---------------------------------------------------------------------------

export const GLSServiceSchema = z.object({
  code: z.string().min(1),
  adrParameter: z.object({ value: z.string() }).optional(),
  aosParameter: z.object({ value: z.string() }).optional(),
  cs1Parameter: z.object({ value: z.string() }).optional(),
  ddsParameter: z.object({ value: z.string() }).optional(),
  dpvParameter: z.object({ stringValue: z.string(), decimalValue: z.number() }).optional(),
  fdsParameter: z.object({ value: z.string() }).optional(),
  fssParameter: z.object({ value: z.string() }).optional(),
  insParameter: z.object({ value: z.number() }).optional(),
  mmpParameter: z.object({ value: z.number() }).optional(),
  sdsParameter: z.object({ startTime: z.string(), endTime: z.string() }).optional(),
  sm1Parameter: z.object({ value: z.string() }).optional(),
  sm2Parameter: z.object({ value: z.string() }).optional(),
  szlParameter: z.object({ value: z.string() }).optional(),
  value: z.string().optional(),
});

export const GLSCarrierOptionsSchema = z.object({
  packageType: z.number().int().min(1).max(7).optional(),
  pickupDate: z.string().datetime().optional(),
  saturdayDelivery: z.boolean().optional(),
  senderIdentityCardNumber: z.string().optional(),
  pickupType: z.number().optional(),
  services: z.array(GLSServiceSchema).optional(),
  content: z.string().optional(),
  flexDeliveryServiceEmailFDS: z.boolean().optional(),
  flexDeliveryServiceSmsFSS: z.boolean().optional(),
  guaranteed24H: z.boolean().optional(),
  contactServiceCS1: z.boolean().optional(),
  smsPreadviceSM2: z.boolean().optional(),
  shopReturnServiceSRS: z.boolean().optional(),
});

export type GLSCarrierOptions = z.infer<typeof GLSCarrierOptionsSchema>;

// ---------------------------------------------------------------------------
// Printer-level options — shared across label & print-labels flows
// ---------------------------------------------------------------------------

export const GLSPrinterOptionsSchema = z.object({
  printerType: PrinterTypeEnum.optional(),
  country: z.string().optional(),
  printPosition: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  showPrintDialog: z.boolean().optional(),
});

export type GLSPrinterOptions = z.infer<typeof GLSPrinterOptionsSchema>;
