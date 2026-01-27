/**
 * OAuth Fallback Tests
 * 
 * Tests for the OAuth fallback wrapper that handles "Basic auth disabled" errors
 * and automatically exchanges credentials for OAuth tokens.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isBasicAuthDisabledError } from '../utils/httpUtils.js';

describe('OAuth Fallback - Error Detection', () => {
  describe('isBasicAuthDisabledError', () => {
    it('should detect "Basic authentication is not enabled" message', () => {
      const error = {
        fault: {
          faultstring: 'Basic authentication is not enabled for this proxy or client.',
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
          },
        },
      };

      expect(isBasicAuthDisabledError(error)).toBe(true);
    });

    it('should detect "BasicAuthNotEnabled" error code', () => {
      const error = {
        fault: {
          faultstring: 'Authentication failed',
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
          },
        },
      };

      expect(isBasicAuthDisabledError(error)).toBe(true);
    });

    it('should not detect other 401 errors', () => {
      const error = {
        fault: {
          faultstring: 'Invalid credentials',
          detail: {
            errorcode: 'InvalidCredentials',
          },
        },
      };

      expect(isBasicAuthDisabledError(error)).toBe(false);
    });

    it('should handle non-fault errors', () => {
      const error = {
        error: 'Some error',
        message: 'Not a fault response',
      };

      expect(isBasicAuthDisabledError(error)).toBe(false);
    });

    it('should handle null/undefined input', () => {
      expect(isBasicAuthDisabledError(null)).toBe(false);
      expect(isBasicAuthDisabledError(undefined)).toBe(false);
      expect(isBasicAuthDisabledError('')).toBe(false);
      expect(isBasicAuthDisabledError(123)).toBe(false);
    });

    it('should handle missing fault detail', () => {
      const error = {
        fault: {
          faultstring: 'Basic authentication is not enabled',
        },
      };

      expect(isBasicAuthDisabledError(error)).toBe(true);
    });

    it('should be case-sensitive for error code', () => {
      const error = {
        fault: {
          faultstring: 'Some error',
          detail: {
            errorcode: 'raisefault.basicauthnotenabled', // lowercase
          },
        },
      };

      expect(isBasicAuthDisabledError(error)).toBe(false);
    });
  });

  describe('HttpError structure detection', () => {
    it('should explain the structure of HttpError from axios-client', () => {
      // This documents the structure of HttpError for debugging purposes
      // When an HTTP error occurs, it has this structure:
      const exampleHttpError = {
        message: 'Request failed with status code 401',
        isAxiosError: true,
        status: 401,
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: {
            fault: {
              faultstring: 'Basic authentication is not enabled for this proxy or client.',
              detail: {
                errorcode: 'RaiseFault.BasicAuthNotEnabled',
              },
            },
          },
          headers: {},
        },
      };

      // The wrapper checks: errObj.status === 401 && errObj.response?.data
      expect(exampleHttpError.status).toBe(401);
      expect(exampleHttpError.response?.data).toBeDefined();

      // Then it passes response.data to isBasicAuthDisabledError
      expect(isBasicAuthDisabledError(exampleHttpError.response?.data)).toBe(true);
    });
  });
});
