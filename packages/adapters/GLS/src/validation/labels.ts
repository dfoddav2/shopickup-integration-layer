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
