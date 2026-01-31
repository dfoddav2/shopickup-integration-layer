/**
 * Unit Tests for GLS Label Mappers and Validators
 * 
 * Tests mapping logic between canonical Shopickup types and GLS label types,
 * plus validation of request/response structures.
 */

import { describe, it, expect } from 'vitest';
import {
  mapCanonicalCreateLabelsToGLSPrintLabels,
  mapGLSPrintLabelsToCanonicalCreateLabels,
} from '../mappers/labels.js';
import {
  safeValidateCreateLabelsRequest,
  safeValidateGLSPrintLabelsRequest,
  safeValidateGLSPrintLabelsResponse,
} from '../validation/labels.js';

describe('GLS Label Mappers', () => {
  describe('mapCanonicalCreateLabelsToGLSPrintLabels', () => {
    it('should map CreateLabelsRequest with parcel IDs to GLS PrintLabelsRequest', () => {
      const req = {
        parcelCarrierIds: ['GLS-12345', 'GLS-12346'],
        credentials: {
          username: 'test@example.com',
          password: 'hashedPassword123',
          clientNumberList: [67890],
          webshopEngine: 'shopickup/1.0',
        },
      };

      const result = mapCanonicalCreateLabelsToGLSPrintLabels(
        req,
        67890,
        'test@example.com',
        'hashedPassword123',
        'shopickup/1.0'
      );

      expect(result).toBeDefined();
      expect(result.parcelList).toHaveLength(2);
      expect(result.parcelList[0]).toMatchObject({
        clientNumber: 67890,
        clientReference: 'GLS-12345',
        username: 'test@example.com',
        password: 'hashedPassword123',
        clientNumberList: [67890],
      });
      expect(result.typeOfPrinter).toBe('Thermo');
      expect(result.username).toBe('test@example.com');
      expect(result.clientNumberList).toEqual([67890]);
    });

    it('should handle single parcel ID', () => {
      const req = {
        parcelCarrierIds: ['GLS-99999'],
        credentials: {
          username: 'admin@gls.hu',
          password: 'secret',
          clientNumberList: [11111],
        },
      };

      const result = mapCanonicalCreateLabelsToGLSPrintLabels(
        req,
        11111,
        'admin@gls.hu',
        'secret'
      );

      expect(result.parcelList).toHaveLength(1);
      expect(result.parcelList[0].clientReference).toBe('GLS-99999');
    });
  });

  describe('mapGLSPrintLabelsToCanonicalCreateLabels', () => {
    it('should map GLS PrintLabelsResponse with successful labels', () => {
      const glsResponse = {
        labels: Buffer.from('PDF content here').toString('base64'),
        printLabelsInfoList: [
          {
            clientReference: 'ORDER-001',
            parcelId: 12345,
            parcelNumber: 1,
          },
          {
            clientReference: 'ORDER-002',
            parcelId: 12346,
            parcelNumber: 2,
          },
        ],
        printLabelsErrorList: [],
      };

      const result = mapGLSPrintLabelsToCanonicalCreateLabels(glsResponse, 2);

      expect(result).toBeDefined();
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.totalCount).toBe(2);
      expect(result.allSucceeded).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.results).toHaveLength(2);
      expect(result.rawCarrierResponse).toBeDefined(); // PDF bytes
      expect(result.summary).toContain('All 2 labels generated successfully');
    });

    it('should map GLS PrintLabelsResponse with partial failures', () => {
      const glsResponse = {
        labels: Buffer.from('PDF').toString('base64'),
        printLabelsInfoList: [
          {
            clientReference: 'ORDER-001',
            parcelId: 12345,
          },
        ],
        printLabelsErrorList: [
          {
            errorCode: 400,
            errorDescription: 'Invalid address',
            clientReferenceList: ['ORDER-002'],
          },
        ],
      };

      const result = mapGLSPrintLabelsToCanonicalCreateLabels(glsResponse, 2);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.someFailed).toBe(true);
      expect(result.allSucceeded).toBe(false);
      expect(result.summary).toContain('Mixed results');
    });

    it('should handle all failures response', () => {
      const glsResponse = {
        printLabelsErrorList: [
          {
            errorCode: 401,
            errorDescription: 'Unauthorized',
            clientReferenceList: ['ORDER-001', 'ORDER-002'],
          },
        ],
      };

      const result = mapGLSPrintLabelsToCanonicalCreateLabels(glsResponse, 2);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.allFailed).toBe(true);
    });

    it('should convert base64 PDF string to Buffer', () => {
      const pdfContent = 'Mock PDF content';
      const base64Pdf = Buffer.from(pdfContent).toString('base64');

      const glsResponse = {
        labels: base64Pdf,
        printLabelsInfoList: [
          {
            clientReference: 'ORDER-001',
            parcelId: 12345,
          },
        ],
      };

      const result = mapGLSPrintLabelsToCanonicalCreateLabels(glsResponse, 1);

      expect(result.rawCarrierResponse).toBeDefined();
      expect(Buffer.isBuffer(result.rawCarrierResponse)).toBe(true);
    });

    it('should handle binary PDF data directly', () => {
      const pdfBuffer = Buffer.from('Binary PDF data');

      const glsResponse = {
        labels: pdfBuffer,
        printLabelsInfoList: [
          {
            clientReference: 'ORDER-001',
            parcelId: 12345,
          },
        ],
      };

      const result = mapGLSPrintLabelsToCanonicalCreateLabels(glsResponse, 1);

      expect(result.rawCarrierResponse).toBe(pdfBuffer);
    });
  });
});

describe('GLS Label Validators', () => {
  describe('safeValidateCreateLabelsRequest', () => {
    it('should validate correct CreateLabelsRequest', () => {
      const req = {
        parcelCarrierIds: ['GLS-12345'],
        credentials: {
          username: 'test@example.com',
          password: 'secret',
          clientNumberList: [67890],
        },
      };

      const result = safeValidateCreateLabelsRequest(req);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(req);
    });

    it('should reject request with missing parcelCarrierIds', () => {
      const req = {
        credentials: {
          username: 'test@example.com',
        },
      };

      const result = safeValidateCreateLabelsRequest(req);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('parcelCarrierIds must be an array');
    });

    it('should reject request with empty parcelCarrierIds', () => {
      const req = {
        parcelCarrierIds: [],
        credentials: { username: 'test@example.com' },
      };

      const result = safeValidateCreateLabelsRequest(req);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('cannot be empty');
    });

    it('should reject request with missing credentials', () => {
      const req = {
        parcelCarrierIds: ['GLS-12345'],
      };

      const result = safeValidateCreateLabelsRequest(req);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('credentials object is required');
    });

    it('should handle undefined request', () => {
      const result = safeValidateCreateLabelsRequest(undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('is required');
    });
  });

  describe('safeValidateGLSPrintLabelsRequest', () => {
    it('should validate correct GLS PrintLabelsRequest', () => {
      const req = {
        parcelList: [
          {
            clientNumber: 67890,
            clientReference: 'ORDER-001',
            pickupAddress: { name: 'Test', street: 'Main', city: 'Budapest', zipCode: '1011', countryIsoCode: 'HU' },
            deliveryAddress: { name: 'Recipient', street: 'Street', city: 'City', zipCode: '1234', countryIsoCode: 'HU' },
          },
        ],
        username: 'test@example.com',
        password: 'hashedPassword',
        clientNumberList: [67890],
      };

      const result = safeValidateGLSPrintLabelsRequest(req);

      expect(result.success).toBe(true);
    });

    it('should reject request with empty parcelList', () => {
      const req = {
        parcelList: [],
        username: 'test@example.com',
        password: 'secret',
        clientNumberList: [67890],
      };

      const result = safeValidateGLSPrintLabelsRequest(req);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('parcelList must be a non-empty array');
    });

    it('should reject request with missing username', () => {
      const req = {
        parcelList: [{ clientNumber: 67890 }],
        password: 'secret',
        clientNumberList: [67890],
      };

      const result = safeValidateGLSPrintLabelsRequest(req);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('username is required');
    });

    it('should reject request with missing password', () => {
      const req = {
        parcelList: [{ clientNumber: 67890 }],
        username: 'test@example.com',
        clientNumberList: [67890],
      };

      const result = safeValidateGLSPrintLabelsRequest(req);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('password is required');
    });

    it('should reject request with empty clientNumberList', () => {
      const req = {
        parcelList: [{ clientNumber: 67890 }],
        username: 'test@example.com',
        password: 'secret',
        clientNumberList: [],
      };

      const result = safeValidateGLSPrintLabelsRequest(req);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('clientNumberList must be a non-empty array');
    });
  });

  describe('safeValidateGLSPrintLabelsResponse', () => {
    it('should validate response with labels', () => {
      const resp = {
        labels: Buffer.from('PDF'),
        printLabelsInfoList: [{ clientReference: 'ORDER-001', parcelId: 12345 }],
      };

      const result = safeValidateGLSPrintLabelsResponse(resp);

      expect(result.success).toBe(true);
    });

    it('should validate response with errors', () => {
      const resp = {
        printLabelsErrorList: [
          {
            errorCode: 400,
            errorDescription: 'Error',
          },
        ],
      };

      const result = safeValidateGLSPrintLabelsResponse(resp);

      expect(result.success).toBe(true);
    });

    it('should reject response with neither labels nor errors', () => {
      const resp = {
        printLabelsInfoList: [],
        printLabelsErrorList: [],
      };

      const result = safeValidateGLSPrintLabelsResponse(resp);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('should contain labels or errors');
    });

    it('should handle undefined response', () => {
      const result = safeValidateGLSPrintLabelsResponse(undefined);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('is required');
    });
  });
});
