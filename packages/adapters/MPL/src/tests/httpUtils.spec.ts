import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildMPLHeaders, isBasicAuthDisabledError } from '../utils/httpUtils.js';
import type { MPLCredentials } from '../validation.js';

describe('MPL HTTP Utils', () => {
  describe('buildMPLHeaders', () => {
    it('should build headers with OAuth2 Bearer token', () => {
      const credentials: MPLCredentials = {
        authType: 'oauth2',
        oAuth2Token: 'test-bearer-token-123',
      };

      const headers = buildMPLHeaders(credentials, 'ACC-001');

      expect(headers['Authorization']).toBe('Bearer test-bearer-token-123');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Accounting-Code']).toBe('ACC-001');
      expect(headers['X-Request-ID']).toBeDefined();
      expect(typeof headers['X-Request-ID']).toBe('string');
      // UUID format check (basic)
      expect(headers['X-Request-ID']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should build headers with Basic auth (API Key + Secret)', () => {
      const credentials: MPLCredentials = {
        authType: 'apiKey',
        apiKey: 'my-api-key',
        apiSecret: 'my-api-secret',
      };

      const headers = buildMPLHeaders(credentials, 'ACC-002');

      // Base64 encode "my-api-key:my-api-secret"
      const expectedBase64 = Buffer.from('my-api-key:my-api-secret').toString('base64');
      expect(headers['Authorization']).toBe(`Basic ${expectedBase64}`);
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Accounting-Code']).toBe('ACC-002');
      expect(headers['X-Request-ID']).toBeDefined();
    });

    it('should use provided requestId instead of generating UUID', () => {
      const credentials: MPLCredentials = {
        authType: 'oauth2',
        oAuth2Token: 'token-123',
      };
      const customRequestId = 'custom-request-id-abc-123';

      const headers = buildMPLHeaders(credentials, 'ACC-003', customRequestId);

      expect(headers['X-Request-ID']).toBe('custom-request-id-abc-123');
    });

    it('should generate unique X-Request-ID for each call', () => {
      const credentials: MPLCredentials = {
        authType: 'oauth2',
        oAuth2Token: 'token-123',
      };

      const headers1 = buildMPLHeaders(credentials, 'ACC-004');
      const headers2 = buildMPLHeaders(credentials, 'ACC-004');

      expect(headers1['X-Request-ID']).not.toBe(headers2['X-Request-ID']);
    });

    it('should include all required headers', () => {
      const credentials: MPLCredentials = {
        authType: 'apiKey',
        apiKey: 'key',
        apiSecret: 'secret',
      };

      const headers = buildMPLHeaders(credentials, 'ACC-005');

      expect(headers).toHaveProperty('Authorization');
      expect(headers).toHaveProperty('Content-Type');
      expect(headers).toHaveProperty('X-Accounting-Code');
      expect(headers).toHaveProperty('X-Request-ID');
    });

    it('should throw error for unsupported auth type', () => {
      const credentials = {
        authType: 'unknown-auth-type',
      } as any;

      expect(() => buildMPLHeaders(credentials, 'ACC-006')).toThrow(
        /Unsupported MPL auth type/
      );
    });

    it('should properly Base64 encode credentials with special characters', () => {
      const credentials: MPLCredentials = {
        authType: 'apiKey',
        apiKey: 'key:with:colons',
        apiSecret: 'secret+with+special/chars=',
      };

      const headers = buildMPLHeaders(credentials, 'ACC-007');

      const expectedBase64 = Buffer.from('key:with:colons:secret+with+special/chars=').toString('base64');
      expect(headers['Authorization']).toBe(`Basic ${expectedBase64}`);

      // Verify it can be decoded back
      const decoded = Buffer.from(expectedBase64, 'base64').toString('utf-8');
      expect(decoded).toBe('key:with:colons:secret+with+special/chars=');
    });

    it('should not include X-Accounting-Code header if accounting code is empty', () => {
      const credentials: MPLCredentials = {
        authType: 'oauth2',
        oAuth2Token: 'token-123',
      };

      // When accounting code is empty, header should not be set
      const headers = buildMPLHeaders(credentials, '');

      // According to the code, if accountingCode is empty, it skips adding the header
      expect(headers['X-Accounting-Code']).toBeUndefined();
    });

    it('should handle OAuth token with special characters', () => {
      const credentials: MPLCredentials = {
        authType: 'oauth2',
        oAuth2Token: 'APRug5AE4VGAzNKDPAoxugLiDp0b',
      };

      const headers = buildMPLHeaders(credentials, 'ACC-008');

      expect(headers['Authorization']).toBe('Bearer APRug5AE4VGAzNKDPAoxugLiDp0b');
    });

    it('should handle very long accounting codes', () => {
      const credentials: MPLCredentials = {
        authType: 'oauth2',
        oAuth2Token: 'token-123',
      };
      const longAccountingCode = 'A'.repeat(100);

      const headers = buildMPLHeaders(credentials, longAccountingCode);

      expect(headers['X-Accounting-Code']).toBe(longAccountingCode);
    });

    it('should handle accounting code with special characters', () => {
      const credentials: MPLCredentials = {
        authType: 'oauth2',
        oAuth2Token: 'token-123',
      };
      const accountingCodeWithSpecialChars = 'ACC-2024/12/31-special_chars';

      const headers = buildMPLHeaders(credentials, accountingCodeWithSpecialChars);

      expect(headers['X-Accounting-Code']).toBe('ACC-2024/12/31-special_chars');
    });
  });

  describe('isBasicAuthDisabledError', () => {
    it('should detect Basic auth disabled error by error message', () => {
      const response = {
        fault: {
          faultstring: 'Basic authentication is not enabled for this proxy or client.',
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
          },
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(true);
    });

    it('should detect Basic auth disabled error by error code', () => {
      const response = {
        fault: {
          faultstring: 'Some other error message',
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
          },
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(true);
    });

    it('should return false for other auth errors', () => {
      const response = {
        fault: {
          faultstring: 'Invalid API key',
          detail: {
            errorcode: 'RaiseFault.InvalidCredentials',
          },
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(false);
    });

    it('should return false for non-auth errors', () => {
      const response = {
        fault: {
          faultstring: 'Internal server error',
          detail: {
            errorcode: 'InternalError',
          },
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(false);
    });

    it('should return false for null body', () => {
      expect(isBasicAuthDisabledError(null)).toBe(false);
    });

    it('should return false for undefined body', () => {
      expect(isBasicAuthDisabledError(undefined)).toBe(false);
    });

    it('should return false for non-object body', () => {
      expect(isBasicAuthDisabledError('error string')).toBe(false);
      expect(isBasicAuthDisabledError(123)).toBe(false);
      expect(isBasicAuthDisabledError([])).toBe(false);
    });

    it('should return false when fault is missing', () => {
      const response = {
        error: 'Some error',
      };

      expect(isBasicAuthDisabledError(response)).toBe(false);
    });

    it('should return false when fault is not an object', () => {
      const response = {
        fault: 'fault string instead of object',
      };

      expect(isBasicAuthDisabledError(response)).toBe(false);
    });

    it('should return false when detail is missing and faultstring does not mention Basic auth', () => {
      const response = {
        fault: {
          faultstring: 'Some error',
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(false);
    });

    it('should return true when detail is missing but faultstring mentions Basic auth', () => {
      const response = {
        fault: {
          faultstring: 'Basic authentication is not enabled for this proxy or client.',
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(true);
    });

    it('should return false when faultstring is missing but error code matches', () => {
      const response = {
        fault: {
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
          },
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(true);
    });

    it('should be case-sensitive for error code matching', () => {
      const response = {
        fault: {
          faultstring: 'Some error',
          detail: {
            errorcode: 'raisefault.basicauthnotenabled', // lowercase
          },
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(false);
    });

    it('should handle empty error code', () => {
      const response = {
        fault: {
          faultstring: 'Basic authentication is not enabled for this proxy or client.',
          detail: {
            errorcode: '',
          },
        },
      };

      // Should still match because of faultstring
      expect(isBasicAuthDisabledError(response)).toBe(true);
    });

    it('should handle empty faultstring', () => {
      const response = {
        fault: {
          faultstring: '',
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
          },
        },
      };

      // Should still match because of errorcode
      expect(isBasicAuthDisabledError(response)).toBe(true);
    });

    it('should detect partial faultstring match', () => {
      const response = {
        fault: {
          faultstring: 'Error: Basic authentication is not enabled for this resource',
          detail: {
            errorcode: 'SomeOtherCode',
          },
        },
      };

      expect(isBasicAuthDisabledError(response)).toBe(true);
    });

    it('should handle faultstring that is not a string', () => {
      const response = {
        fault: {
          faultstring: 12345, // Not a string
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
          },
        },
      };

      // Should still match because of errorcode
      expect(isBasicAuthDisabledError(response)).toBe(true);
    });

    it('should handle complex nested structures', () => {
      const response = {
        fault: {
          faultstring: 'Basic authentication is not enabled for this proxy or client.',
          detail: {
            errorcode: 'RaiseFault.BasicAuthNotEnabled',
            additionalInfo: { nested: { deeply: 'value' } },
          },
          extra: 'fields',
        },
        other: 'fields',
      };

      expect(isBasicAuthDisabledError(response)).toBe(true);
    });
  });
});
