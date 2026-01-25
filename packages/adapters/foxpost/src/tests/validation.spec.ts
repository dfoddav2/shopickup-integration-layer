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
   safeValidateFoxpostApiError,
   safeValidateFoxpostLabelPdfRaw,
   safeValidateFoxpostLabelPdfMetadata,
   safeValidateFoxpostLabelInfo,
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

   describe('ApiError validation', () => {
     it('validates a complete ApiError response', () => {
       const apiError = {
         timestamp: '2021-07-29T06:54:31.472Z',
         error: 'WRONG_USERNAME_OR_PASSWORD',
         status: 401,
       };

       const response = safeValidateFoxpostApiError(apiError);
       expect(response.success).toBe(true);
       expect(response.data?.error).toBe('WRONG_USERNAME_OR_PASSWORD');
       expect(response.data?.status).toBe(401);
     });

     it('validates with minimal fields', () => {
       const apiError = {
         error: 'Invalid request',
       };

       const response = safeValidateFoxpostApiError(apiError);
       expect(response.success).toBe(true);
     });

     it('accepts extra fields', () => {
       const apiError = {
         error: 'Bad request',
         status: 400,
         customField: 'some value',
         nested: { data: 'extra' },
       };

       const response = safeValidateFoxpostApiError(apiError);
       expect(response.success).toBe(true);
     });
   });

   describe('PDF raw validation', () => {
     it('validates a non-empty Buffer', () => {
       const buffer = Buffer.from([1, 2, 3, 4, 5]);
       const response = safeValidateFoxpostLabelPdfRaw(buffer);
       expect(response.success).toBe(true);
     });

     it('validates a non-empty Uint8Array', () => {
       const uint8 = new Uint8Array([1, 2, 3]);
       const response = safeValidateFoxpostLabelPdfRaw(uint8);
       expect(response.success).toBe(true);
     });

     it('rejects empty Buffer', () => {
       const buffer = Buffer.alloc(0);
       const response = safeValidateFoxpostLabelPdfRaw(buffer);
       expect(response.success).toBe(false);
     });

     it('rejects null', () => {
       const response = safeValidateFoxpostLabelPdfRaw(null);
       expect(response.success).toBe(false);
     });

     it('rejects undefined', () => {
       const response = safeValidateFoxpostLabelPdfRaw(undefined);
       expect(response.success).toBe(false);
     });

     it('rejects object without byteLength', () => {
       const response = safeValidateFoxpostLabelPdfRaw({ data: 'invalid' });
       expect(response.success).toBe(false);
     });
   });

   describe('PDF metadata validation', () => {
      it('validates all page sizes', () => {
        const pageSizes = ['A6', 'A7', '_85X85'] as const;

        pageSizes.forEach(size => {
          const metadata = { size, barcodesCount: 5 };
          const response = safeValidateFoxpostLabelPdfMetadata(metadata);
          expect(response.success).toBe(true);
          expect(response.data?.size).toBe(size);
        });
      });

     it('validates startPos range 0-7', () => {
       const positions = [0, 1, 3, 7];
       positions.forEach(pos => {
         const metadata = { startPos: pos };
         const response = safeValidateFoxpostLabelPdfMetadata(metadata);
         expect(response.success).toBe(true);
       });
     });

     it('rejects startPos > 7', () => {
       const metadata = { startPos: 8 };
       const response = safeValidateFoxpostLabelPdfMetadata(metadata);
       expect(response.success).toBe(false);
     });

     it('rejects startPos < 0', () => {
       const metadata = { startPos: -1 };
       const response = safeValidateFoxpostLabelPdfMetadata(metadata);
       expect(response.success).toBe(false);
     });

     it('validates with minimal fields', () => {
       const response = safeValidateFoxpostLabelPdfMetadata({});
       expect(response.success).toBe(true);
     });

     it('accepts extra fields', () => {
       const metadata = {
         size: 'A7',
         barcodesCount: 3,
         customField: 'extra',
       };
       const response = safeValidateFoxpostLabelPdfMetadata(metadata);
       expect(response.success).toBe(true);
     });
   });

   describe('LabelInfo validation', () => {
     it('validates a complete LabelInfo response', () => {
       const labelInfo = {
         senderName: 'Teszt János',
         senderZip: '1034',
         senderCity: 'Budapest',
         senderAddress: 'Robert Károly krt. 12-14.',
         recipientName: 'Teszt Aladár',
         recipientEmail: 'teszt.aladar@teszt.hu',
         recipientPhone: '+36300000000',
         recipientZip: '1034',
         recipientCity: 'Budapest',
         recipientAddress: 'Robert Károly krt. 12-14.',
         apm: '35',
         cod: 5000,
         isFragile: true,
         barcode: 'CLFOX0000000000',
         refCode: '111111-111111',
         depoCode: '22',
         courierCode: 'B29',
         sendType: 'HD',
       };

       const response = safeValidateFoxpostLabelInfo(labelInfo);
       expect(response.success).toBe(true);
       expect(response.data?.barcode).toBe('CLFOX0000000000');
       expect(response.data?.sendType).toBe('HD');
     });

     it('validates all sendType values', () => {
       const sendTypes = ['APM', 'HD', 'COLLECT'] as const;

       sendTypes.forEach(type => {
         const labelInfo = { sendType: type };
         const response = safeValidateFoxpostLabelInfo(labelInfo);
         expect(response.success).toBe(true);
       });
     });

     it('validates with minimal fields', () => {
       const response = safeValidateFoxpostLabelInfo({});
       expect(response.success).toBe(true);
     });

     it('accepts extra fields', () => {
       const labelInfo = {
         barcode: 'CLFOX0000000000',
         customField: 'extra',
         nested: { data: 'value' },
       };

       const response = safeValidateFoxpostLabelInfo(labelInfo);
       expect(response.success).toBe(true);
     });
   });
 });
