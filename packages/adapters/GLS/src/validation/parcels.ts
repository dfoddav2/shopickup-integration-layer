/**
 * GLS Parcel Creation Validation Schemas
 * 
 * Zod schemas for validating parcel creation requests and responses.
 */

import { z, type ZodSafeParseResult } from 'zod';

/**
 * Validates a CreateParcelRequest
 * Returns validation result with data or error details
 */
export function safeValidateCreateParcelRequest(req: unknown): ZodSafeParseResult<any> {
  const schema = z.object({
    parcel: z.object({
      id: z.string(),
      weight: z.number().positive('Weight must be positive').optional(),
      sender: z.object({
        name: z.string().min(1),
        street: z.string().min(1),
        city: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().min(2).max(2),
      }),
      destination: z.object({
        name: z.string().min(1),
        street: z.string().min(1),
        city: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().min(2).max(2),
      }),
    }),
    credentials: z.object({
      username: z.string().min(1),
      password: z.string().min(1),
      clientNumberList: z.array(z.number().int().positive()).min(1),
    }),
    options: z.object({
      country: z.string().min(2).max(2).optional(),
      useTestApi: z.boolean().optional(),
    }).optional(),
  });
  
  return schema.safeParse(req);
}

/**
 * Validates a CreateParcelsRequest
 * Returns validation result with data or error details
 */
export function safeValidateCreateParcelsRequest(req: unknown): ZodSafeParseResult<any> {
  const schema = z.object({
    parcels: z.array(
      z.object({
        id: z.string(),
        weight: z.number().positive('Weight must be positive').optional(),
        sender: z.object({
          name: z.string().min(1),
          street: z.string().min(1),
          city: z.string().min(1),
          postalCode: z.string().min(1),
          country: z.string().min(2).max(2),
        }),
        destination: z.object({
          name: z.string().min(1),
          street: z.string().min(1),
          city: z.string().min(1),
          postalCode: z.string().min(1),
          country: z.string().min(2).max(2),
        }),
      })
    ).min(1),
    credentials: z.object({
      username: z.string().min(1),
      password: z.string().min(1),
      clientNumberList: z.array(z.number().int().positive()).min(1),
    }),
    options: z.object({
      country: z.string().min(2).max(2).optional(),
      useTestApi: z.boolean().optional(),
    }).optional(),
  });
  
  return schema.safeParse(req);
}

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
