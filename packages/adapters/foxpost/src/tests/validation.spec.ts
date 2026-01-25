/**
 * Tests for Foxpost validation schemas
 * Ensures Zod schemas correctly validate tracking responses and requests
 */

import { describe, it, expect } from 'vitest';
import {
  validateFoxpostTracking,
  safeValidateFoxpostTracking,
  validateFoxpostCredentials,
  safeValidateFoxpostCredentials,
  safeValidateTrackingRequest,
  FoxpostTraceStatus,
  FoxpostParcelType,
  FoxpostSendType,
} from '../validation.js';
import type { FoxpostTracking, FoxpostTrace } from '../validation.js';

describe('Foxpost Validation Schemas', () => {
  describe('validateFoxpostTracking', () => {
    it('validates a complete tracking response', () => {
      const validResponse = {
        clFox: 'CLFOX0000000001',
        parcelType: 'NORMAL' as const,
        sendType: 'HD' as const,
        traces: [
          {
            statusDate: '2021-07-29T06:54:31.472Z',
            statusStationId: 'MA',
            shortName: 'Csomagod elkészült',
            longName: 'Csomagod létrejött a rendszerünkben.',
            status: 'CREATE' as const,
          },
        ],
        relatedParcel: undefined,
        estimatedDelivery: '2021-07-29',
      };

      const result = validateFoxpostTracking(validResponse);
      expect(result.clFox).toBe('CLFOX0000000001');
      expect(result.traces?.length).toBe(1);
      expect(result.traces?.[0].status).toBe('CREATE');
    });

    it('validates with minimal fields', () => {
      const minimalResponse = {
        clFox: 'CLFOX0000000001',
      };

      const result = validateFoxpostTracking(minimalResponse);
      expect(result.clFox).toBe('CLFOX0000000001');
    });

    it('validates relatedParcel as null', () => {
      const response = {
        clFox: 'CLFOX0000000001',
        relatedParcel: null,
      };

      const result = validateFoxpostTracking(response);
      expect(result.relatedParcel).toBeNull();
    });

    it('transforms string statusDate to Date', () => {
      const response = safeValidateFoxpostTracking({
        clFox: 'CLFOX0000000001',
        traces: [
          {
            statusDate: '2021-07-29T06:54:31.472Z',
            status: 'CREATE',
          },
        ],
      });

      if (response.success) {
        expect(response.data.traces?.[0].statusDate).toBeInstanceOf(Date);
      }
    });

    it('rejects invalid parcelType', () => {
      const invalidResponse = {
        clFox: 'CLFOX0000000001',
        parcelType: 'INVALID_TYPE',
      };

      const result = safeValidateFoxpostTracking(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects invalid sendType', () => {
      const invalidResponse = {
        clFox: 'CLFOX0000000001',
        sendType: 'INVALID_SEND',
      };

      const result = safeValidateFoxpostTracking(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects invalid trace status', () => {
      const invalidResponse = {
        clFox: 'CLFOX0000000001',
        traces: [
          {
            statusDate: '2021-07-29T06:54:31.472Z',
            status: 'INVALID_STATUS',
          },
        ],
      };

      const result = safeValidateFoxpostTracking(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('accepts extra fields via passthrough', () => {
      const responseWithExtra = {
        clFox: 'CLFOX0000000001',
        traces: [
          {
            statusDate: '2021-07-29T06:54:31.472Z',
            status: 'CREATE',
            extraField: 'should be ignored',
            anotherField: 123,
          },
        ],
        unknownField: 'allowed by passthrough',
      };

      const result = validateFoxpostTracking(responseWithExtra);
      expect(result.clFox).toBe('CLFOX0000000001');
      // Extra fields are not in the type but are allowed
    });

    it('allows empty traces array', () => {
      const response: FoxpostTracking = {
        clFox: 'CLFOX0000000001',
        traces: [],
      };

      const result = validateFoxpostTracking(response);
      expect(result.traces).toHaveLength(0);
    });
  });

  describe('safeValidateFoxpostTracking', () => {
    it('returns success result for valid input', () => {
      const valid = {
        clFox: 'CLFOX0000000001',
        traces: [
          {
            statusDate: '2021-07-29T06:54:31.472Z',
            status: 'RECEIVE',
          },
        ],
      };

      const result = safeValidateFoxpostTracking(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.clFox).toBe('CLFOX0000000001');
      }
    });

    it('returns error result for invalid input', () => {
      const invalid = {
        clFox: 'CLFOX0000000001',
        traces: [
          {
            statusDate: 'not a date',
            status: 'RECEIVE',
          },
        ],
      };

      const result = safeValidateFoxpostTracking(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('handles null input gracefully', () => {
      const result = safeValidateFoxpostTracking(null);
      expect(result.success).toBe(false);
    });

    it('handles undefined input gracefully', () => {
      const result = safeValidateFoxpostTracking(undefined);
      expect(result.success).toBe(false);
    });
  });

  describe('validateFoxpostCredentials', () => {
    it('validates complete credentials', () => {
      const creds = {
        apiKey: 'test-key',
        basicUsername: 'user',
        basicPassword: 'pass',
      };

      const result = validateFoxpostCredentials(creds);
      expect(result.apiKey).toBe('test-key');
      expect(result.basicUsername).toBe('user');
      expect(result.basicPassword).toBe('pass');
    });

    it('rejects missing apiKey', () => {
      const creds = {
        basicUsername: 'user',
        basicPassword: 'pass',
      };

      const result = safeValidateFoxpostCredentials(creds);
      expect(result.success).toBe(false);
    });

    it('rejects empty apiKey', () => {
      const creds = {
        apiKey: '',
        basicUsername: 'user',
        basicPassword: 'pass',
      };

      const result = safeValidateFoxpostCredentials(creds);
      expect(result.success).toBe(false);
    });
  });

  describe('safeValidateTrackingRequest', () => {
    it('validates a complete tracking request', () => {
      const req = {
        trackingNumber: 'CLFOX0000000001',
        credentials: {
          apiKey: 'key',
          basicUsername: 'user',
          basicPassword: 'pass',
        },
        options: { useTestApi: true },
      };

      const result = safeValidateTrackingRequest(req);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.trackingNumber).toBe('CLFOX0000000001');
        expect(result.data.options?.useTestApi).toBe(true);
      }
    });

    it('validates without options', () => {
      const req = {
        trackingNumber: 'CLFOX0000000001',
        credentials: {
          apiKey: 'key',
          basicUsername: 'user',
          basicPassword: 'pass',
        },
      };

      const result = safeValidateTrackingRequest(req);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.options).toBeUndefined();
      }
    });

    it('rejects missing trackingNumber', () => {
      const req = {
        credentials: {
          apiKey: 'key',
          basicUsername: 'user',
          basicPassword: 'pass',
        },
      };

      const result = safeValidateTrackingRequest(req);
      expect(result.success).toBe(false);
    });

    it('rejects empty trackingNumber', () => {
      const req = {
        trackingNumber: '',
        credentials: {
          apiKey: 'key',
          basicUsername: 'user',
          basicPassword: 'pass',
        },
      };

      const result = safeValidateTrackingRequest(req);
      expect(result.success).toBe(false);
    });

    it('rejects invalid credentials', () => {
      const req = {
        trackingNumber: 'CLFOX0000000001',
        credentials: {
          apiKey: '',
          basicUsername: 'user',
          basicPassword: 'pass',
        },
      };

      const result = safeValidateTrackingRequest(req);
      expect(result.success).toBe(false);
    });
  });

  describe('Trace status enum', () => {
    it('accepts all valid trace statuses', () => {
      const validStatuses: FoxpostTraceStatus[] = [
        'CREATE',
        'RECEIVE',
        'HDSENT',
        'HDINTRANSIT',
        'HDRECEIVE',
        'RETURNED',
        'HDUNDELIVERABLE',
        'OVERTIMEOUT',
      ];

      validStatuses.forEach(status => {
        const response = safeValidateFoxpostTracking({
          clFox: 'CLFOX0000000001',
          traces: [
            {
              statusDate: '2021-07-29T06:54:31.472Z',
              status,
            },
          ],
        });
        expect(response.success).toBe(true);
      });
    });
  });

  describe('Parcel type enum', () => {
    it('accepts all valid parcel types', () => {
      const validTypes: FoxpostParcelType[] = ['NORMAL', 'RE', 'XRE', 'IRE', 'C2B'];

      validTypes.forEach(type => {
        const response = safeValidateFoxpostTracking({
          clFox: 'CLFOX0000000001',
          parcelType: type,
        });
        expect(response.success).toBe(true);
      });
    });
  });

  describe('Send type enum', () => {
    it('accepts all valid send types', () => {
      const validTypes: FoxpostSendType[] = ['APM', 'HD', 'COLLECT'];

      validTypes.forEach(type => {
        const response = safeValidateFoxpostTracking({
          clFox: 'CLFOX0000000001',
          sendType: type,
        });
        expect(response.success).toBe(true);
      });
    });
  });
});
