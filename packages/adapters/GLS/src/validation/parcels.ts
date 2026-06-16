/**
 * GLS Parcel Creation Validation Schemas
 * 
 * Zod schemas for validating parcel creation requests and responses.
 */

import { z, type ZodSafeParseResult } from 'zod';
import type { Parcel } from '@shopickup/core';

/**
 * Validates a CreateParcelRequest
 * Returns validation result with data or error details
 */
export function safeValidateCreateParcelRequest(req: unknown): ZodSafeParseResult<any> {
  const AddressSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(2).max(2, 'Country code must be 2 characters'),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    company: z.string().optional(),
    province: z.string().optional(),
    isPoBox: z.boolean().optional(),
  });

  const ContactSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    company: z.string().optional(),
  });

  const HomeDeliverySchema = z.object({
    method: z.literal('HOME'),
    address: AddressSchema,
    instructions: z.string().optional(),
  });

  const PickupPointDeliverySchema = z.object({
    method: z.literal('PICKUP_POINT'),
    pickupPoint: z.object({
      id: z.string(),
      provider: z.string().optional(),
      name: z.string().optional(),
      address: AddressSchema.optional(),
      type: z.enum(['LOCKER', 'SHOP', 'POST_OFFICE', 'OTHER']).optional(),
    }),
    instructions: z.string().optional(),
  });

const ParcelSchema = z.object({
     id: z.string().min(1, 'Parcel ID is required'),
     package: z.object({
       weightGrams: z.number().positive('Weight must be positive'),
       dimensionsCm: z.object({
         length: z.number().positive(),
         width: z.number().positive(),
         height: z.number().positive(),
       }).optional(),
     }),
     service: z.enum(['standard', 'express', 'economy', 'overnight']),
     shipper: z.object({
       contact: ContactSchema,
       address: AddressSchema,
     }),
     recipient: z.object({
       contact: ContactSchema,
       delivery: z.union([HomeDeliverySchema, PickupPointDeliverySchema]),
     }),
     carrierServiceCode: z.string().optional(),
     handling: z.object({
       fragile: z.boolean().optional(),
       perishables: z.boolean().optional(),
       batteries: z.enum(['NONE', 'LITHIUM_ION', 'LITHIUM_METAL']).optional(),
     }).optional(),
     cod: z.object({
       amount: z.object({
         value: z.number().nonnegative(),
         currency: z.string().length(3),
       }),
       reference: z.string().optional(),
     }).optional(),
     declaredValue: z.object({
       value: z.number().nonnegative(),
       currency: z.string().length(3),
     }).optional(),
     insurance: z.object({
       amount: z.object({
         value: z.number().nonnegative(),
         currency: z.string().length(3),
       }),
     }).optional(),
     references: z.object({
       orderId: z.string().optional(),
       customerReference: z.string().optional(),
     }).optional(),
     items: z.array(z.object({
       sku: z.string().optional(),
       quantity: z.number().positive('Quantity must be positive'),
       description: z.string().optional(),
       weight: z.number().optional(),
       metadata: z.record(z.string(), z.unknown()).optional(),
     })).optional(),
metadata: z.record(z.string(), z.unknown()).optional(),
   });

    const schema = z.object({
    parcel: ParcelSchema,
    credentials: z.object({
      username: z.string().min(1, 'Username is required'),
      password: z.string().min(1, 'Password is required'),
      clientNumberList: z.array(z.number().int().positive()).min(1, 'At least one client number required'),
      webshopEngine: z.string().optional(),
    }),
    options: z.object({
      country: z.string().min(2).max(2).optional(),
      useTestApi: z.boolean().optional(),
      gls: z.object({
        packageType: z.number().int().min(1).max(7).optional().describe('Override package type (1=Colli, 2=Box, 3=Roll, 4=Can, 5=Case, 6=Reel, 7=Sack). If omitted, defaults to 1 (Colli).'),
        pickupDate: z.string().datetime().optional().describe('Planned pickup date (ISO 8601).'),
        saturdayDelivery: z.boolean().optional().describe('Enable Saturday Delivery (SAT service).'),
        senderIdentityCardNumber: z.string().optional().describe('Serbia-only: sender identity card number / PIB.'),
        pickupType: z.number().optional().describe('LRS (LockerReturn Service) pickup type — always 2 for HU.'),
        services: z.array(z.object({
          code: z.string().min(1, 'Service code is required'),
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
        })).optional().describe('Explicit additional services.'),
        content: z.string().optional().describe('Override parcel contents description.'),
        flexDeliveryServiceEmailFDS: z.boolean().optional().describe('Enable FDS Flexible Delivery Service (email notification). Requires valid email in recipient.contact.email.'),
        flexDeliveryServiceSmsFSS: z.boolean().optional().describe('Enable FSS Flexible Delivery SMS Service (SMS notification). Requires valid phone in recipient.contact.phone and flexDeliveryServiceEmailFDS must be true.'),
        guaranteed24H: z.boolean().optional().describe('Enable guaranteed 24H delivery service.'),
        contactServiceCS1: z.boolean().optional().describe('Enable CS1 Contact Service. Requires valid phone in recipient.contact.phone.'),
        smsPreadviceSM2: z.boolean().optional().describe('Enable SMS pre-advice (SM2). Requires valid phone in international format.'),
        shopReturnServiceSRS: z.boolean().optional().describe('Enable ShopReturn Service (SRS). Available only in HU and SI.'),
        useTestApi: z.boolean().optional().describe('GLS API mode: false=production, true=test. FDS/FSS are disabled in test mode.'),
      }).optional(),
    }).optional(),
  });

  return schema.safeParse(req);
}

export type GLSCreateParcelRequest = {
  parcel: Parcel;
  credentials: {
    username: string;
    password: string;
    clientNumberList: number[];
    webshopEngine?: string;
  };
  options?: {
    country?: string;
    useTestApi?: boolean;
    gls?: {
      country?: string;
      printerType?: string;
      packageType?: number;
      pickupDate?: string;
      saturdayDelivery?: boolean;
      senderIdentityCardNumber?: string;
      pickupType?: number;
      services?: Array<{
        code: string;
        value?: string;
        adrParameter?: { value: string };
        aosParameter?: { value: string };
        cs1Parameter?: { value: string };
        ddsParameter?: { value: string };
        dpvParameter?: { stringValue: string; decimalValue: number };
        fdsParameter?: { value: string };
        fssParameter?: { value: string };
        insParameter?: { value: number };
        mmpParameter?: { value: number };
        sdsParameter?: { startTime: string; endTime: string };
        sm1Parameter?: { value: string };
        sm2Parameter?: { value: string };
        szlParameter?: { value: string };
      }>;
content?: string;
        flexDeliveryServiceEmailFDS?: boolean;
        flexDeliveryServiceSmsFSS?: boolean;
       guaranteed24H?: boolean;
       contactServiceCS1?: boolean;
       smsPreadviceSM2?: boolean;
       shopReturnServiceSRS?: boolean;
       useTestApi?: boolean;
     };
  };
};

/**
 * Validates a CreateParcelsRequest (canonical format)
 * Returns validation result with data or error details
 * 
 * Expected format:
 * {
 *   parcels: [
 *     {
 *       id: string,
 *       package: { weightGrams: number },
 *       service: "standard" | "express" | "economy" | "overnight",
 *       shipper: {
 *         contact: { name: string, phone?: string, email?: string },
 *         address: { name: string, street: string, city: string, postalCode: string, country: string }
 *       },
 *       recipient: {
 *         contact: { name: string, phone?: string, email?: string },
 *         delivery: {
 *           method: "HOME" | "PICKUP_POINT",
 *           address?: { ... },
 *           pickupPoint?: { ... }
 *         }
 *       }
 *     }
 *   ],
 *   credentials: { username: string, password: string, clientNumberList: number[] },
 *   options?: { country?: string, useTestApi?: boolean }
 * }
 */
export function safeValidateCreateParcelsRequest(req: unknown): ZodSafeParseResult<any> {
  const AddressSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(2).max(2, 'Country code must be 2 characters'),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    company: z.string().optional(),
    province: z.string().optional(),
    isPoBox: z.boolean().optional(),
  });

  const ContactSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    company: z.string().optional(),
  });

  const HomeDeliverySchema = z.object({
    method: z.literal('HOME'),
    address: AddressSchema,
    instructions: z.string().optional(),
  });

  const PickupPointDeliverySchema = z.object({
    method: z.literal('PICKUP_POINT'),
    pickupPoint: z.object({
      id: z.string(),
      provider: z.string().optional(),
      name: z.string().optional(),
      address: AddressSchema.optional(),
      type: z.enum(['LOCKER', 'SHOP', 'POST_OFFICE', 'OTHER']).optional(),
    }),
    instructions: z.string().optional(),
  });

  const DeliverySchema = z.union([HomeDeliverySchema, PickupPointDeliverySchema]);

  const ParcelSchema = z.object({
    id: z.string().min(1, 'Parcel ID is required'),
    package: z.object({
      weightGrams: z.number().positive('Weight must be positive'),
      dimensionsCm: z.object({
        length: z.number().positive(),
        width: z.number().positive(),
        height: z.number().positive(),
      }).optional(),
    }),
    service: z.enum(['standard', 'express', 'economy', 'overnight']),
    shipper: z.object({
      contact: ContactSchema,
      address: AddressSchema,
    }),
    recipient: z.object({
      contact: ContactSchema,
      delivery: DeliverySchema,
    }),
    carrierServiceCode: z.string().optional(),
    handling: z.object({
      fragile: z.boolean().optional(),
      perishables: z.boolean().optional(),
      batteries: z.enum(['NONE', 'LITHIUM_ION', 'LITHIUM_METAL']).optional(),
    }).optional(),
    cod: z.object({
      amount: z.object({
        value: z.number().nonnegative(),
        currency: z.string().length(3),
      }),
      reference: z.string().optional(),
    }).optional(),
    declaredValue: z.object({
      value: z.number().nonnegative(),
      currency: z.string().length(3),
    }).optional(),
    insurance: z.object({
      amount: z.object({
        value: z.number().nonnegative(),
        currency: z.string().length(3),
      }),
    }).optional(),
    references: z.object({
      orderId: z.string().optional(),
      customerReference: z.string().optional(),
    }).optional(),
    items: z.array(z.object({
      sku: z.string().optional(),
      quantity: z.number().positive('Quantity must be positive'),
      description: z.string().optional(),
      weight: z.number().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  const schema = z.object({
    parcels: z.array(ParcelSchema).min(1, 'At least one parcel is required'),
    credentials: z.object({
      username: z.string().min(1, 'Username is required'),
      password: z.string().min(1, 'Password is required'),
      clientNumberList: z.array(z.number().int().positive()).min(1, 'At least one client number required'),
      webshopEngine: z.string().optional(),
    }),
    options: z.object({
      country: z.string().min(2).max(2).optional(),
      useTestApi: z.boolean().optional(),
      gls: z.object({
        packageType: z.number().int().min(1).max(7).optional().describe('Override package type (1=Colli, 2=Box, 3=Roll, 4=Can, 5=Case, 6=Reel, 7=Sack). If omitted, defaults to 1 (Colli).'),
        pickupDate: z.string().datetime().optional().describe('Planned pickup date (ISO 8601).'),
        saturdayDelivery: z.boolean().optional().describe('Enable Saturday Delivery (SAT service).'),
        senderIdentityCardNumber: z.string().optional().describe('Serbia-only: sender identity card number / PIB.'),
        pickupType: z.number().optional().describe('LRS (LockerReturn Service) pickup type — always 2 for HU.'),
        services: z.array(z.object({
          code: z.string().min(1, 'Service code is required'),
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
        })).optional().describe('Explicit additional services.'),
        content: z.string().optional().describe('Override parcel contents description.'),
        flexDeliveryServiceEmailFDS: z.boolean().optional().describe('Enable FDS Flexible Delivery Service (email notification). Requires valid email in recipient.contact.email.'),
        flexDeliveryServiceSmsFSS: z.boolean().optional().describe('Enable FSS Flexible Delivery SMS Service (SMS notification). Requires valid phone in recipient.contact.phone and flexDeliveryServiceEmailFDS must be true.'),
      }).optional(),
    }).optional(),
  });

  return schema.safeParse(req);
}

export type GLSCreateParcelsRequest = {
  parcels: Parcel[];
  credentials: GLSCreateParcelRequest['credentials'];
  options?: GLSCreateParcelRequest['options'];
};

/**
 * Validates a single GLS address object
 */
export const GLSAddressSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  street: z.string().min(1, 'Street is required'),
  houseNumber: z.string().optional(),
  houseNumberInfo: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  zipCode: z.string().min(1, 'Zip code is required'),
  countryIsoCode: z.string().length(2, 'Country code must be 2 letters'),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
});

/**
 * Validates a GLS service parameter (string type)
 */
export const GLSServiceParameterStringSchema = z.object({
  value: z.string(),
});

/**
 * Validates a GLS service parameter (decimal type)
 */
export const GLSServiceParameterDecimalSchema = z.object({
  value: z.number(),
});

/**
 * Validates a GLS service object
 */
export const GLSServiceSchema = z.object({
  code: z.string().min(1, 'Service code is required'),
  adrParameter: GLSServiceParameterStringSchema.optional(),
  aosParameter: GLSServiceParameterStringSchema.optional(),
  cs1Parameter: GLSServiceParameterStringSchema.optional(),
  ddsParameter: z.object({ value: z.string() }).optional(),
  dpvParameter: z.object({
    stringValue: z.string(),
    decimalValue: z.number(),
  }).optional(),
  fdsParameter: GLSServiceParameterStringSchema.optional(),
  fssParameter: GLSServiceParameterStringSchema.optional(),
  insParameter: GLSServiceParameterDecimalSchema.optional(),
  mmpParameter: GLSServiceParameterDecimalSchema.optional(),
  psdParameter: z.object({
    stringValue: z.string(),
    integerValue: z.number().int(),
  }).optional(),
  sdsParameter: z.object({
    startTime: z.string(),
    endTime: z.string(),
  }).optional(),
  sm1Parameter: GLSServiceParameterStringSchema.optional(),
  sm2Parameter: GLSServiceParameterStringSchema.optional(),
  szlParameter: GLSServiceParameterStringSchema.optional(),
  value: z.string().optional(),
});

/**
 * Validates a GLS parcel property (dimensions, weight)
 */
export const GLSParcelPropertySchema = z.object({
  content: z.string().optional(),
  packageType: z.number().int().min(1).max(7).optional(),
  height: z.number().positive().optional(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  weight: z.number().positive().optional(),
});

/**
 * Validates a GLS parcel object
 */
export const GLSParcelSchema = z.object({
  clientNumber: z.number().int().positive('Client number must be positive'),
  clientReference: z.string().optional(),
  count: z.number().int().min(1).max(99).optional().default(1),
  codAmount: z.number().nonnegative().optional(),
  codCurrency: z.string().length(3).optional(),
  codReference: z.string().optional(),
  content: z.string().optional(),
  pickupDate: z.string().datetime().optional(),
  pickupAddress: GLSAddressSchema,
  deliveryAddress: GLSAddressSchema,
  serviceList: z.array(GLSServiceSchema).optional(),
  senderIdentityCardNumber: z.string().optional(),
  pickupType: z.number().optional(),
  parcelPropertyList: z.array(GLSParcelPropertySchema).optional(),
});

/**
 * Validates a GLS PrepareLabelsRequest
 */
export const GLSPrepareLabelsRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  clientNumberList: z.array(z.number().int().positive()).min(1, 'At least one client number required'),
  webshopEngine: z.string().optional(),
  parcelList: z.array(GLSParcelSchema).min(1, 'At least one parcel required'),
});

/**
 * Validates a GLS ParcelInfo (success response)
 */
export const GLSParcelInfoSchema = z.object({
  clientReference: z.string().optional(),
  parcelId: z.number().int().positive(),
});

/**
 * Validates a GLS ErrorInfo (error response)
 */
export const GLSErrorInfoSchema = z.object({
  errorCode: z.number().int(),
  errorDescription: z.string(),
  clientReferenceList: z.array(z.string()).optional(),
  parcelIdList: z.array(z.number().int()).optional(),
});

/**
 * Validates a GLS PrepareLabelsResponse
 */
export const GLSPrepareLabelsResponseSchema = z.object({
  parcelInfoList: z.array(GLSParcelInfoSchema).optional(),
  prepareLabelsError: z.array(GLSErrorInfoSchema).optional(),
});

/**
 * Validates the response from GLS PrepareLabels operation
 */
export function safeValidateGLSPrepareLabelsResponse(
  response: unknown
): ZodSafeParseResult<any> {
  return GLSPrepareLabelsResponseSchema.safeParse(response);
}
