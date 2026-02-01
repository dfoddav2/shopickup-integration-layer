/**
 * GLS Label Request/Response Validation
 * 
 * Safe validators for label-related requests and responses.
 * Returns { success: true } or { success: false, error: ValidationError }.
 */

import type {
  CreateLabelsRequest,
  ParcelValidationError,
} from '@shopickup/core';
import type {
  GLSPrintLabelsRequest,
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
 * Safely validate CreateLabelsRequest
 * Checks for required fields and proper structure
 */
export function safeValidateCreateLabelsRequest(
  req: any
): ValidationResult<CreateLabelsRequest> {
  try {
    if (!req) {
      return {
        success: false,
        error: {
          message: 'CreateLabelsRequest is required',
          field: 'req',
        },
      };
    }

    if (!Array.isArray(req.parcelCarrierIds)) {
      return {
        success: false,
        error: {
          message: 'parcelCarrierIds must be an array',
          field: 'parcelCarrierIds',
        },
      };
    }

    if (req.parcelCarrierIds.length === 0) {
      return {
        success: false,
        error: {
          message: 'parcelCarrierIds array cannot be empty',
          field: 'parcelCarrierIds',
        },
      };
    }

    // Check credentials
    if (!req.credentials || typeof req.credentials !== 'object') {
      return {
        success: false,
        error: {
          message: 'credentials object is required',
          field: 'credentials',
        },
      };
    }

    return {
      success: true,
      data: req as CreateLabelsRequest,
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
 * Safely validate GLSPrintLabelsRequest
 * Checks for required GLS API fields
 */
export function safeValidateGLSPrintLabelsRequest(
  req: any
): ValidationResult<GLSPrintLabelsRequest> {
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
      data: req as GLSPrintLabelsRequest,
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

    // Response should have either labels or error list
    if (!resp.labels && (!resp.printLabelsErrorList || resp.printLabelsErrorList.length === 0)) {
      return {
        success: false,
        error: {
          message: 'Response should contain labels or errors',
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
