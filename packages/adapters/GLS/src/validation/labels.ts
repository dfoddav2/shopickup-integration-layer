/**
 * GLS Label Request/Response Validation
 * 
 * Safe validators for label-related requests and responses.
 * Returns { success: true } or { success: false, error: ValidationError }.
 */

import type {
  CreateLabelsRequest,
  Parcel,
  ParcelValidationError,
} from '@shopickup/core';
import { z } from 'zod';

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

const CanonicalParcelSchema = z.object({
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
      amount: z.number().nonnegative(),
      currency: z.string().length(3),
    }),
    reference: z.string().optional(),
  }).optional(),
  declaredValue: z.object({
    amount: z.number().nonnegative(),
    currency: z.string().length(3),
  }).optional(),
  insurance: z.object({
    amount: z.object({
      amount: z.number().nonnegative(),
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

const GLSSpecificOptionsSchema = z.object({
  useTestApi: z.boolean().optional(),
  gls: z.object({
    printerType: z
      .enum([
        'A4_2x2',
        'A4_4x1',
        'Connect',
        'Thermo',
        'ThermoZPL',
        'ShipItThermoPdf',
        'ThermoZPL_300DPI',
      ])
      .optional(),
    country: z.string().optional(),
    printPosition: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    showPrintDialog: z.boolean().optional(),
  }).optional(),
}).optional();

/**
 * Zod schema for GLS create labels request. Mirrors canonical `CreateLabelsRequest`
 * but nests GLS-specific options under `options.gls`.
 */
export const GLSCreateLabelsRequestSchema = z.object({
  parcelCarrierIds: z.array(z.string()).min(1),
  credentials: z.object({
    username: z.string(),
    password: z.string(),
    clientNumberList: z.array(z.number()).min(1),
    webshopEngine: z.string().optional(),
  }),
  options: z
    .object({
      useTestApi: z.boolean().optional(),
      gls: z
        .object({
          printerType: z
            .enum([
              'A4_2x2',
              'A4_4x1',
              'Connect',
              'Thermo',
              'ThermoZPL',
              'ShipItThermoPdf',
              'ThermoZPL_300DPI',
            ])
            .optional(),
          // Carrier-specific country override lives under options.gls.country
          country: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type GLSCreateLabelsRequest = z.infer<typeof GLSCreateLabelsRequestSchema>;
/**
 * Singular create-label request (typed)
 */
export const GLSCreateLabelRequestSchema = z.object({
  parcelCarrierId: z.string(),
  credentials: z.object({
    username: z.string(),
    password: z.string(),
    clientNumberList: z.array(z.number()).min(1),
    webshopEngine: z.string().optional(),
  }),
  options: z
    .object({
      useTestApi: z.boolean().optional(),
      gls: z
        .object({
          printerType: z
            .enum([
              'A4_2x2',
              'A4_4x1',
              'Connect',
              'Thermo',
              'ThermoZPL',
              'ShipItThermoPdf',
              'ThermoZPL_300DPI',
            ])
            .optional(),
          country: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type GLSCreateLabelRequest = z.infer<typeof GLSCreateLabelRequestSchema>;

/**
 * One-step PrintLabels request (single parcel payload)
 */
export const GLSPrintLabelRequestSchema = z.object({
  parcel: CanonicalParcelSchema,
  credentials: z.object({
    username: z.string(),
    password: z.string(),
    clientNumberList: z.array(z.number()).min(1),
    webshopEngine: z.string().optional(),
  }),
  options: GLSSpecificOptionsSchema,
});

/**
 * One-step PrintLabels batch request (full parcel payloads)
 */
export const GLSPrintLabelsRequestSchema = z.object({
  parcels: z.array(CanonicalParcelSchema).min(1),
  credentials: z.object({
    username: z.string(),
    password: z.string(),
    clientNumberList: z.array(z.number()).min(1),
    webshopEngine: z.string().optional(),
  }),
  options: GLSSpecificOptionsSchema,
});

export type GLSPrintLabelRequest = {
  parcel: Parcel;
  credentials: {
    username: string;
    password: string;
    clientNumberList: number[];
    webshopEngine?: string;
  };
  options?: z.infer<typeof GLSSpecificOptionsSchema>;
};

export type GLSPrintLabelsRequest = {
  parcels: Parcel[];
  credentials: GLSPrintLabelRequest['credentials'];
  options?: GLSPrintLabelRequest['options'];
};

import type {
  GLSPrintLabelsRequest as GLSPrintLabelsApiRequest,
  GLSPrintLabelsResponse,
  GLSGetPrintDataRequest,
  GLSGetPrintDataResponse,
  GLSGetPrintedLabelsRequest,
  GLSGetPrintedLabelsResponse,
} from '../types/index.js';

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  error?: ParcelValidationError;
}

/**
 * Safely validate GLSPrintLabelsRequest
 * Checks for required GLS API fields
 */
export function safeValidateGLSPrintLabelsRequest(
  req: any
): ValidationResult<GLSPrintLabelsApiRequest> {
  try {
    if (!req) {
      return {
        success: false,
        error: {
          message: 'GLSPrintLabelsRequest is required',
          field: 'req',
        },
      };
    }

    if (!Array.isArray(req.parcelList) || req.parcelList.length === 0) {
      return {
        success: false,
        error: {
          message: 'parcelList must be a non-empty array',
          field: 'parcelList',
        },
      };
    }

    if (!req.username) {
      return {
        success: false,
        error: {
          message: 'username is required',
          field: 'username',
        },
      };
    }

    if (!req.password) {
      return {
        success: false,
        error: {
          message: 'password is required',
          field: 'password',
        },
      };
    }

    if (!Array.isArray(req.clientNumberList) || req.clientNumberList.length === 0) {
      return {
        success: false,
        error: {
          message: 'clientNumberList must be a non-empty array',
          field: 'clientNumberList',
        },
      };
    }

    return {
      success: true,
      data: req as GLSPrintLabelsApiRequest,
    };
  } catch (e) {
    return {
      success: false,
      error: {
        message: `Validation error: ${e instanceof Error ? e.message : String(e)}`,
        field: 'unknown',
      },
    };
  }
}

/**
 * Safely validate GLSPrintLabelsResponse
 * Checks response structure (lenient - doesn't throw if shape is unexpected)
 */
export function safeValidateGLSPrintLabelsResponse(
  resp: any
): ValidationResult<GLSPrintLabelsResponse> {
  try {
    if (!resp) {
      return {
        success: false,
        error: {
          message: 'GLSPrintLabelsResponse is required',
          field: 'resp',
        },
      };
    }

    const hasLabels = !!(resp.labels || resp.Labels);
    const hasErrors = !!(
      (resp.printLabelsErrorList && resp.printLabelsErrorList.length > 0) ||
      (resp.PrintLabelsErrorList && resp.PrintLabelsErrorList.length > 0)
    );
    const hasInfoList = !!(
      (resp.printLabelsInfoList && resp.printLabelsInfoList.length > 0) ||
      (resp.PrintLabelsInfoList && resp.PrintLabelsInfoList.length > 0)
    );

    // Response should have labels, info list, or error list
    if (!hasLabels && !hasInfoList && !hasErrors) {
      return {
        success: false,
        error: {
          message: 'Response should contain labels, print labels info, or errors',
          field: 'response',
        },
      };
    }

    return {
      success: true,
      data: resp as GLSPrintLabelsResponse,
    };
  } catch (e) {
    return {
      success: false,
      error: {
        message: `Validation error: ${e instanceof Error ? e.message : String(e)}`,
        field: 'unknown',
      },
    };
  }
}

/**
 * Safely validate GetPrintDataRequest
 * Checks for required GLS API fields
 */
export function safeValidateGetPrintDataRequest(
  req: any
): ValidationResult<GLSGetPrintDataRequest> {
  try {
    if (!req) {
      return {
        success: false,
        error: {
          message: 'GetPrintDataRequest is required',
          field: 'req',
        },
      };
    }

    // Must have either parcelIdList or parcelList
    // But according to OpenAPI spec, parcelList is REQUIRED
    if (!Array.isArray(req.parcelList)) {
      return {
        success: false,
        error: {
          message: 'parcelList must be an array',
          field: 'parcelList',
        },
      };
    }

    if (!req.username) {
      return {
        success: false,
        error: {
          message: 'username is required',
          field: 'username',
        },
      };
    }

    if (!req.password) {
      return {
        success: false,
        error: {
          message: 'password is required',
          field: 'password',
        },
      };
    }

    if (!Array.isArray(req.clientNumberList) || req.clientNumberList.length === 0) {
      return {
        success: false,
        error: {
          message: 'clientNumberList must be a non-empty array',
          field: 'clientNumberList',
        },
      };
    }

    return {
      success: true,
      data: req as GLSGetPrintDataRequest,
    };
  } catch (e) {
    return {
      success: false,
      error: {
        message: `Validation error: ${e instanceof Error ? e.message : String(e)}`,
        field: 'unknown',
      },
    };
  }
}

/**
 * Safely validate GLSGetPrintDataResponse
 * Checks response structure (lenient - doesn't throw if shape is unexpected)
 * 
 * NOTE: GLS API may return responses in different formats:
 * - With pdfdocument: Full label PDF
 * - Without pdfdocument but with printDataInfoList: Metadata-only (test API behavior)
 * - With getPrintDataErrorList: Error response
 */
export function safeValidateGLSGetPrintDataResponse(
  resp: any
): ValidationResult<GLSGetPrintDataResponse> {
  try {
    if (!resp) {
      return {
        success: false,
        error: {
          message: 'GLSGetPrintDataResponse is required',
          field: 'resp',
        },
      };
    }

    // Response is valid if it has ANY of: pdfdocument, printDataInfoList, or errors
    // (handles different API response modes)
    const hasPdf = resp.pdfdocument || (resp as any).Pdfdocument;
    const hasMetadata = (resp.printDataInfoList || (resp as any).PrintDataInfoList)?.length > 0;
    const hasErrors = (resp.getPrintDataErrorList || (resp as any).GetPrintDataErrorList)?.length > 0;
    
    if (!hasPdf && !hasMetadata && !hasErrors) {
      return {
        success: false,
        error: {
          message: 'Response should contain pdfdocument, printDataInfoList, or error list',
          field: 'response',
        },
      };
    }

    return {
      success: true,
      data: resp as GLSGetPrintDataResponse,
    };
  } catch (e) {
    return {
      success: false,
      error: {
        message: `Validation error: ${e instanceof Error ? e.message : String(e)}`,
        field: 'unknown',
      },
    };
  }
}

/**
 * Validate GLS GetPrintedLabels Request
 * @param req GetPrintedLabels request object
 * @returns Validation result
 */
export function safeValidateGetPrintedLabelsRequest(
  req: any
): ValidationResult<GLSGetPrintedLabelsRequest> {
  try {
    if (!req) {
      return {
        success: false,
        error: {
          message: 'GetPrintedLabelsRequest is required',
          field: 'req',
        },
      };
    }

    const parcelIdList = req.parcelIdList || (req as any).ParcelIdList;
    if (!Array.isArray(parcelIdList) || parcelIdList.length === 0) {
      return {
        success: false,
        error: {
          message: 'parcelIdList must be a non-empty array',
          field: 'parcelIdList',
        },
      };
    }

    if (parcelIdList.length > 99) {
      return {
        success: false,
        error: {
          message: 'parcelIdList cannot exceed 99 items per request',
          field: 'parcelIdList',
        },
      };
    }

    return {
      success: true,
      data: req as GLSGetPrintedLabelsRequest,
    };
  } catch (e) {
    return {
      success: false,
      error: {
        message: `Validation error: ${e instanceof Error ? e.message : String(e)}`,
        field: 'unknown',
      },
    };
  }
}

/**
 * Validate GLS GetPrintedLabels Response
 * @param resp GetPrintedLabels response object
 * @returns Validation result
 */
export function safeValidateGLSGetPrintedLabelsResponse(
  resp: any
): ValidationResult<GLSGetPrintedLabelsResponse> {
  try {
    if (!resp) {
      return {
        success: false,
        error: {
          message: 'GLSGetPrintedLabelsResponse is required',
          field: 'resp',
        },
      };
    }

    // Response is valid if it has ANY of: labels, printDataInfoList, or errors
    const hasLabels = resp.labels || (resp as any).Labels;
    const hasMetadata = (resp.printDataInfoList || (resp as any).PrintDataInfoList)?.length > 0;
    const hasErrors = (resp.getPrintedLabelsErrorList || (resp as any).GetPrintedLabelsErrorList)?.length > 0;
    
    if (!hasLabels && !hasMetadata && !hasErrors) {
      return {
        success: false,
        error: {
          message: 'Response should contain labels, printDataInfoList, or error list',
          field: 'response',
        },
      };
    }

    return {
      success: true,
      data: resp as GLSGetPrintedLabelsResponse,
    };
  } catch (e) {
    return {
      success: false,
      error: {
        message: `Validation error: ${e instanceof Error ? e.message : String(e)}`,
        field: 'unknown',
      },
    };
  }
}
