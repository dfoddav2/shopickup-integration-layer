import { describe, it, expect, beforeEach } from 'vitest';
import { MPLAdapter } from '../index.js';
import type {
  AdapterContext,
  HttpResponse,
  CreateLabelRequest,
  CreateLabelsRequest,
  CreateLabelsResponse,
  Logger,
} from '@shopickup/core';
import { CarrierError } from '@shopickup/core';

/**
 * Mock HTTP Client for testing
 */
class MockHttpClient {
  private responses: Map<string, any> = new Map();
  private throwError: Error | null = null;
  lastGetUrl?: string;
  lastGetOptions?: any;

  setResponse(url: string, data: any): void {
    this.responses.set(url, data);
  }

  setResponseMatcher(matcher: (url: string) => boolean, data: any): void {
    // Store matcher for pattern matching
    (this.responses as any).matcher = { matcher, data };
  }

  setError(error: Error): void {
    this.throwError = error;
  }

  async post<T>(url: string, data: any, options?: any): Promise<HttpResponse<T>> {
    throw new Error('POST not implemented in mock');
  }

  async get<T>(url: string, options?: any): Promise<HttpResponse<T>> {
    this.lastGetUrl = url;
    this.lastGetOptions = options;

    if (this.throwError) {
      throw this.throwError;
    }

    // First try exact match
    const response = this.responses.get(url);
    if (response) {
      return response as HttpResponse<T>;
    }

    // Then try matcher if available
    const matcher = (this.responses as any).matcher;
    if (matcher && matcher.matcher(url)) {
      return matcher.data as HttpResponse<T>;
    }

    throw new Error(`No mock response configured for ${url}`);
  }

  async put<T>(url: string, data?: any, options?: any): Promise<HttpResponse<T>> {
    throw new Error('PUT not implemented in mock');
  }

  async patch<T>(url: string, data?: any, options?: any): Promise<HttpResponse<T>> {
    throw new Error('PATCH not implemented in mock');
  }

  async delete<T>(url: string, options?: any): Promise<HttpResponse<T>> {
    throw new Error('DELETE not implemented in mock');
  }
}

/**
 * Mock Logger for capturing logs
 */
class MockLogger implements Logger {
  logs: any[] = [];

  debug(msg: string, data?: any): void {
    this.logs.push({ level: 'debug', msg, data });
  }

  info(msg: string, data?: any): void {
    this.logs.push({ level: 'info', msg, data });
  }

  warn(msg: string, data?: any): void {
    this.logs.push({ level: 'warn', msg, data });
  }

  error(msg: string, data?: any): void {
    this.logs.push({ level: 'error', msg, data });
  }

  getLogs(level?: string): any[] {
    return level ? this.logs.filter(l => l.level === level) : this.logs;
  }

  clear(): void {
    this.logs = [];
  }
}

/**
 * Helper: Create a sample base64-encoded PDF (mock label data)
 */
function createMockPdfBase64(): string {
  // Minimal valid PDF header (base64 encoded)
  const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\nxref\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n0\n%%EOF';
  return Buffer.from(pdfContent).toString('base64');
}

describe('MPLAdapter - Labels (CREATE_LABEL, CREATE_LABELS)', () => {
  let adapter: MPLAdapter;
  let httpClient: MockHttpClient;
  let logger: MockLogger;
  let context: AdapterContext;

  beforeEach(() => {
    adapter = new MPLAdapter();
    httpClient = new MockHttpClient();
    logger = new MockLogger();
    context = {
      http: httpClient,
      logger,
      operationName: 'createLabels',
      loggingOptions: {
        silentOperations: [],
        maxArrayItems: 10,
        maxDepth: 3,
      },
    };
  });

  describe('createLabel (single)', () => {
    it('should delegate to createLabels with single tracking number', async () => {
      const pdfBase64 = createMockPdfBase64();
      const mockResponse = {
        status: 200,
        headers: {},
        body: [
          {
            trackingNumber: 'MPL-001',
            label: pdfBase64,
            errors: null,
            warnings: null,
          },
        ],
      };

      // Use matcher since query string order may vary
      httpClient.setResponseMatcher(
        (url) => url.includes('/v2/mplapi/shipments/label') && url.includes('trackingNumbers=MPL-001'),
        mockResponse
      );

      const request: CreateLabelRequest = {
        parcelCarrierId: 'MPL-001',
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      const result = await adapter.createLabel(request, context);

      expect(result.status).toBe('created');
      expect(result.inputId).toBe('MPL-001');
      expect(result.fileId).toBeDefined();
    });
  });

  describe('createLabels (batch)', () => {
    it('should successfully create labels for multiple parcels', async () => {
      const pdfBase64 = createMockPdfBase64();
      const mockResponse = {
        status: 200,
        headers: {},
        body: [
          {
            trackingNumber: 'MPL-001',
            label: pdfBase64,
            errors: null,
            warnings: null,
          },
          {
            trackingNumber: 'MPL-002',
            label: pdfBase64,
            errors: null,
            warnings: null,
          },
        ],
      };

      httpClient.setResponseMatcher(
        (url) => url.includes('/v2/mplapi/shipments/label') && 
                  url.includes('trackingNumbers=MPL-001') && 
                  url.includes('trackingNumbers=MPL-002'),
        mockResponse
      );

      const request: CreateLabelsRequest = {
        parcelCarrierIds: ['MPL-001', 'MPL-002'],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      const result = await adapter.createLabels(request, context);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.totalCount).toBe(2);
      expect(result.allSucceeded).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.files).toHaveLength(1); // Single file (same base64)
    });

    it('should handle missing accountingCode', async () => {
      const request: CreateLabelsRequest = {
        parcelCarrierIds: ['MPL-001'],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        // No accountingCode
      };

      try {
        await adapter.createLabels(request, context);
        expect.fail('Should have thrown CarrierError');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('Validation');
        expect((err as CarrierError).message).toMatch(/accountingCode/i);
      }
    });

    it('should handle validation error (400)', async () => {
      const error = new Error('Bad request');
      (error as any).response = {
        status: 400,
        data: {
          message: 'Invalid label type',
          errorCode: 'INVALID_LABEL_TYPE',
        },
      };

      httpClient.setError(error);

      const request: CreateLabelsRequest = {
        parcelCarrierIds: ['MPL-001'],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      const result = await adapter.createLabels(request, context);

      // Error is handled gracefully - all parcels marked as failed
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.allFailed).toBe(true);
      expect(result.results[0].status).toBe('failed');
    });

    it('should handle authentication error (401)', async () => {
      const error = new Error('Unauthorized');
      (error as any).response = {
        status: 401,
        data: {
          message: 'Invalid credentials',
          errorCode: 'INVALID_CREDENTIALS',
        },
      };

      httpClient.setError(error);

      const request: CreateLabelsRequest = {
        parcelCarrierIds: ['MPL-001'],
        credentials: {
          authType: 'apiKey',
          apiKey: 'invalid-key',
          apiSecret: 'invalid-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      const result = await adapter.createLabels(request, context);

      // Error is handled gracefully - all parcels marked as failed
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.allFailed).toBe(true);
      expect(result.results[0].status).toBe('failed');
    });

    it('should handle rate limit error (429)', async () => {
      const error = new Error('Too many requests');
      (error as any).response = {
        status: 429,
        data: { message: 'Rate limit exceeded' },
        headers: { 'retry-after': '60' },
      };

      httpClient.setError(error);

      const request: CreateLabelsRequest = {
        parcelCarrierIds: ['MPL-001'],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      const result = await adapter.createLabels(request, context);

      // Error is handled gracefully - all parcels marked as failed
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.allFailed).toBe(true);
      expect(result.results[0].status).toBe('failed');
    });

    it('should handle server error (500) as transient', async () => {
      const error = new Error('Internal server error');
      (error as any).response = {
        status: 500,
        data: { message: 'Internal server error' },
      };

      httpClient.setError(error);

      const request: CreateLabelsRequest = {
        parcelCarrierIds: ['MPL-001'],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      const result = await adapter.createLabels(request, context);

      // Error is handled gracefully - all parcels marked as failed
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.allFailed).toBe(true);
      expect(result.results[0].status).toBe('failed');
    });

    it('should handle network error as transient', async () => {
      const error = new Error('Network timeout');
      httpClient.setError(error);

      const request: CreateLabelsRequest = {
        parcelCarrierIds: ['MPL-001'],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      const result = await adapter.createLabels(request, context);

      // Error is handled gracefully - all parcels marked as failed
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(1);
      expect(result.allFailed).toBe(true);
      expect(result.results[0].status).toBe('failed');
    });

    it('should handle partial failures in batch', async () => {
      const pdfBase64 = createMockPdfBase64();
      const mockResponse = {
        status: 200,
        headers: {},
        body: [
          {
            trackingNumber: 'MPL-001',
            label: pdfBase64,
            errors: null,
            warnings: null,
          },
          {
            trackingNumber: 'MPL-002',
            label: null,
            errors: [{ code: 'INVALID_TRACKING', text: 'Tracking number not found' }],
            warnings: null,
          },
          {
            trackingNumber: 'MPL-003',
            label: pdfBase64,
            errors: null,
            warnings: null,
          },
        ],
      };

      httpClient.setResponseMatcher(
        (url) => url.includes('/v2/mplapi/shipments/label') && 
                  url.includes('trackingNumbers=MPL-001') && 
                  url.includes('trackingNumbers=MPL-002') &&
                  url.includes('trackingNumbers=MPL-003'),
        mockResponse
      );

      const request: CreateLabelsRequest = {
        parcelCarrierIds: ['MPL-001', 'MPL-002', 'MPL-003'],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      const result = await adapter.createLabels(request, context);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.totalCount).toBe(3);
      expect(result.someFailed).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results[1].status).toBe('failed');
      expect(result.results[1].errors).toBeDefined();
    });

    it('should handle empty tracking numbers array', async () => {
      const request: CreateLabelsRequest = {
        parcelCarrierIds: [],
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret',
        },
        options: {
          accountingCode: 'ACC-00001',
        },
      };

      try {
        await adapter.createLabels(request, context);
        expect.fail('Should have thrown CarrierError for empty array');
      } catch (err) {
        expect(err).toBeInstanceOf(CarrierError);
        expect((err as CarrierError).category).toBe('Validation');
      }
    });
  });
});
