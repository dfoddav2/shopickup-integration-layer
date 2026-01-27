import { describe, it, expect, beforeEach } from 'vitest';
import { MPLAdapter } from '../index.js';
import type {
  AdapterContext,
  HttpResponse,
  TrackingRequest,
  TrackingUpdate,
  Logger,
} from '@shopickup/core';
import { CarrierError } from '@shopickup/core';

/**
 * Mock HTTP Client for testing tracking operations
 */
class MockHttpClient {
  private responses: Map<string, any> = new Map();
  private throwError: Error | null = null;
  lastGetUrl?: string;
  lastGetOptions?: any;
  lastPostUrl?: string;
  lastPostData?: any;
  lastPostOptions?: any;

  setResponse(url: string, data: any): void {
    this.responses.set(url, data);
  }

  setResponseMatcher(matcher: (url: string) => boolean, data: any): void {
    (this.responses as any).matcher = { matcher, data };
  }

  setError(error: Error): void {
    this.throwError = error;
  }

  async post<T>(url: string, data: any, options?: any): Promise<HttpResponse<T>> {
    this.lastPostUrl = url;
    this.lastPostData = data;
    this.lastPostOptions = options;

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

    throw new Error(`No mock response configured for POST ${url}`);
  }

  async put<T>(_url: string, _data: any, _options?: any): Promise<HttpResponse<T>> {
    throw new Error('PUT not implemented in mock');
  }

  async patch<T>(_url: string, _data: any, _options?: any): Promise<HttpResponse<T>> {
    throw new Error('PATCH not implemented in mock');
  }

  async delete<T>(_url: string, _options?: any): Promise<HttpResponse<T>> {
    throw new Error('DELETE not implemented in mock');
  }

  async get<T>(url: string, _options?: any): Promise<HttpResponse<T>> {
    this.lastGetUrl = url;

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
}

/**
 * Mock logger for testing
 */
class MockLogger implements Logger {
  logs: Array<{ level: string; message: string; context?: any }> = [];

  debug(message: string, context?: any): void {
    this.logs.push({ level: 'debug', message, context });
  }

  info(message: string, context?: any): void {
    this.logs.push({ level: 'info', message, context });
  }

  warn(message: string, context?: any): void {
    this.logs.push({ level: 'warn', message, context });
  }

  error(message: string, context?: any): void {
    this.logs.push({ level: 'error', message, context });
  }
}

describe('MPL Adapter - Tracking (TRACK capability)', () => {
  let adapter: MPLAdapter;
  let mockHttp: MockHttpClient;
  let mockLogger: MockLogger;
  let ctx: AdapterContext;

  beforeEach(() => {
    adapter = new MPLAdapter();
    mockHttp = new MockHttpClient();
    mockLogger = new MockLogger();
    ctx = {
      http: mockHttp,
      logger: mockLogger,
    };
  });

  describe('Single parcel tracking (core interface)', () => {
    it('should track a single parcel with valid response', async () => {
      const trackingNumber = 'CL12345678901';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'DELIVERED',
              c10: '2025-01-27 14:30:00',
              c12: 'Delivered to recipient',
            },
          ],
        },
      };

      // Configure mock to match the Pull-1 guest endpoint
      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);

      expect(result).toBeDefined();
      expect(result.trackingNumber).toBe(trackingNumber);
      expect(result.status).toBe('DELIVERED');
      expect(result.events).toHaveLength(1);
      expect(result.events[0].description).toBe('Delivered to recipient');
      expect(result.lastUpdate).toBeTruthy();
    });

    it('should track a parcel with IN_TRANSIT status', async () => {
      const trackingNumber = 'CL98765432109';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'SZÁLLÍTÁS',
              c10: '2025-01-27 10:00:00',
              c8: 'Budapest',
              c12: 'In transit',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'oauth2',
          oAuth2Token: 'test-token',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);

      expect(result.trackingNumber).toBe(trackingNumber);
      expect(result.status).toBe('IN_TRANSIT');
      expect(result.events[0].location?.city).toBe('Budapest');
    });

    it('should handle EXCEPTION status', async () => {
      const trackingNumber = 'CLEXCEPT123456';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'HIBA',
              c10: '2025-01-27 09:00:00',
              c12: 'Delivery failed - address issue',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);

      expect(result.status).toBe('EXCEPTION');
      expect(result.events[0].description).toBe('Delivery failed - address issue');
    });

    it('should throw CarrierError when tracking not found (empty response)', async () => {
      const trackingNumber = 'CLNOTFOUND123';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      try {
        await adapter.track(request, ctx);
        expect.fail('Should have thrown CarrierError');
      } catch (error) {
        expect(error).toBeInstanceOf(CarrierError);
        const ce = error as CarrierError;
        expect(ce.message).toContain('No tracking information found');
        expect(ce.category).toBe('Validation');
      }
    });

    it('should throw CarrierError for HTTP 401 Unauthorized', async () => {
      const trackingNumber = 'CLAUTH123456';
      const error = new Error('Unauthorized');
      (error as any).status = 401;
      (error as any).statusText = 'Unauthorized';

      mockHttp.setError(error);

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'invalid-key',
          apiSecret: 'invalid-secret',
          accountingCode: 'TEST001',
        },
      };

      try {
        await adapter.track(request, ctx);
        expect.fail('Should have thrown CarrierError');
      } catch (error) {
        expect(error).toBeInstanceOf(CarrierError);
        const ce = error as CarrierError;
        expect(ce.category).toBe('Auth');
      }
    });

    it('should throw CarrierError for HTTP 429 Rate Limited', async () => {
      const trackingNumber = 'CLRATE123456';
      const error = new Error('Too Many Requests');
      (error as any).status = 429;
      (error as any).response = { headers: { 'retry-after': '60' } };

      mockHttp.setError(error);

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      try {
        await adapter.track(request, ctx);
        expect.fail('Should have thrown CarrierError');
      } catch (error) {
        expect(error).toBeInstanceOf(CarrierError);
        const ce = error as CarrierError;
        expect(ce.category).toBe('RateLimit');
      }
    });

    it('should throw CarrierError when HTTP client is not provided', async () => {
      const request: TrackingRequest = {
        trackingNumber: 'CLTEST123456',
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const ctxNoHttp: AdapterContext = { logger: mockLogger };

      try {
        await adapter.track(request, ctxNoHttp);
        expect.fail('Should have thrown CarrierError');
      } catch (error) {
        expect(error).toBeInstanceOf(CarrierError);
        const ce = error as CarrierError;
        expect(ce.message).toContain('HTTP client not provided');
        expect(ce.category).toBe('Permanent');
      }
    });

    it('should handle PENDING status for unprocessed parcels', async () => {
      const trackingNumber = 'CLPENDING123';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'BEÉRKEZETT',
              c10: '2025-01-27 08:00:00',
              c12: 'Parcel received',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);

      expect(result.status).toBe('PENDING');
    });

    it('should handle RETURNED status', async () => {
      const trackingNumber = 'CLRETURNED123';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'VISSZAKÜLDVE',
              c10: '2025-01-27 07:00:00',
              c12: 'Returned to sender',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);

      expect(result.status).toBe('RETURNED');
    });

    it('should include carrier status code in event', async () => {
      const trackingNumber = 'CLCODE123456';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'IN_DELIVERY',
              c10: '2025-01-27 09:30:00',
              c12: 'Out for delivery',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);

      expect(result.events[0].carrierStatusCode).toBe('IN_DELIVERY');
    });

    it('should handle missing optional fields gracefully', async () => {
      const trackingNumber = 'CLMINIMAL123';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              // Only required field, no optional fields
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);

      expect(result.trackingNumber).toBe(trackingNumber);
      expect(result.status).toBe('PENDING'); // Default when c9 is missing
      expect(result.events[0].description).toBe('No description'); // Fallback when c12 missing
    });

    it('should respect useTestApi option', async () => {
      const trackingNumber = 'CLTEST123456';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'DELIVERED',
              c10: '2025-01-27 14:30:00',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
        options: {
          useTestApi: true,
        },
      };

      const result = await adapter.track(request, ctx);

      expect(result).toBeDefined();
      expect(result.trackingNumber).toBe(trackingNumber);
      // Verify that test API URL was used (sandbox)
      expect(mockHttp.lastGetUrl).toContain('sandbox');
    });
  });

  describe('Tracking mapper edge cases', () => {
    it('should map English status codes correctly', async () => {
      const trackingNumber = 'CLENG123456';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'DELIVERED',
              c10: '2025-01-27 14:30:00',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);
      expect(result.status).toBe('DELIVERED');
    });

    it('should handle German status codes', async () => {
      const trackingNumber = 'CLDE123456';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'GELIEFERT',
              c10: '2025-01-27 14:30:00',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/guest'),
        mockResponse
      );

      const request: TrackingRequest = {
        trackingNumber,
        credentials: {
          authType: 'apiKey',
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await adapter.track(request, ctx);
      expect(result.status).toBe('DELIVERED');
    });
  });

  describe('Pull-500 batch tracking', () => {
    it('should submit batch tracking request and get trackingGUID', async () => {
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackingGUID: '550e8400-e29b-41d4-a716-446655440000',
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/v2/mplapi-tracking/tracking'),
        mockResponse
      );

      const { trackPull500Start } = await import('../capabilities/track.js');

      const request = {
        trackingNumbers: ['CL12345678901', 'CL98765432109'],
        credentials: {
          authType: 'apiKey' as const,
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
      };

      const result = await trackPull500Start(request, ctx, (opts) => 'https://api.test');

      expect(result).toBeDefined();
      expect(result.trackingGUID).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(mockHttp.lastPostUrl).toContain('/v2/mplapi-tracking/tracking');
      expect(mockHttp.lastPostData?.trackingNumbers).toEqual(['CL12345678901', 'CL98765432109']);
    });

    it('should reject Pull-500 start request with >500 tracking numbers', async () => {
      const { safeValidatePull500StartRequest } = await import('../validation.js');

      const trackingNumbers = Array.from({ length: 501 }, (_, i) => `CL${i.toString().padStart(12, '0')}`);
      const request = {
        trackingNumbers,
        credentials: {
          authType: 'apiKey' as const,
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const validation = safeValidatePull500StartRequest(request);
      expect(validation.success).toBe(false);
    });

    it('should validate Pull-500 check request with valid trackingGUID', async () => {
      const { safeValidatePull500CheckRequest } = await import('../validation.js');

      const request = {
        trackingGUID: '550e8400-e29b-41d4-a716-446655440000',
        credentials: {
          authType: 'apiKey' as const,
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const validation = safeValidatePull500CheckRequest(request);
      expect(validation.success).toBe(true);
      expect(validation.data?.trackingGUID).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should reject Pull-500 check request with empty trackingGUID', async () => {
      const { safeValidatePull500CheckRequest } = await import('../validation.js');

      const request = {
        trackingGUID: '',
        credentials: {
          authType: 'apiKey' as const,
          apiKey: 'test-key',
          apiSecret: 'test-secret',
        },
      };

      const validation = safeValidatePull500CheckRequest(request);
      expect(validation.success).toBe(false);
    });

    it('should validate Pull-500 check response with NEW status', async () => {
      const { safeValidatePull500CheckResponse } = await import('../validation.js');

      const response = {
        status: 'NEW',
      };

      const validation = safeValidatePull500CheckResponse(response);
      expect(validation.success).toBe(true);
      expect(validation.data?.status).toBe('NEW');
    });

    it('should validate Pull-500 check response with INPROGRESS status', async () => {
      const { safeValidatePull500CheckResponse } = await import('../validation.js');

      const response = {
        status: 'INPROGRESS',
      };

      const validation = safeValidatePull500CheckResponse(response);
      expect(validation.success).toBe(true);
      expect(validation.data?.status).toBe('INPROGRESS');
    });

    it('should validate Pull-500 check response with READY status and report', async () => {
      const { safeValidatePull500CheckResponse } = await import('../validation.js');

      const response = {
        status: 'READY',
        report: 'CL12345678901;DELIVERED;2025-01-27\nCL98765432109;IN_TRANSIT;2025-01-27',
        report_fields: 'tracking;status;date',
      };

      const validation = safeValidatePull500CheckResponse(response);
      expect(validation.success).toBe(true);
      expect(validation.data?.status).toBe('READY');
      expect(validation.data?.report).toBeTruthy();
      expect(validation.data?.report_fields).toBeTruthy();
    });

    it('should validate Pull-500 check response with ERROR status', async () => {
      const { safeValidatePull500CheckResponse } = await import('../validation.js');

      const response = {
        status: 'ERROR',
        errors: [
          {
            code: 'INVALID_GUID',
            text: 'Invalid tracking GUID',
          },
        ],
      };

      const validation = safeValidatePull500CheckResponse(response);
      expect(validation.success).toBe(true);
      expect(validation.data?.status).toBe('ERROR');
      expect(validation.data?.errors).toHaveLength(1);
    });
  });

  describe('trackRegistered() variant', () => {
    it('should track using registered endpoint when explicitly called', async () => {
      const trackingNumber = 'CL12345678901';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c2: 'A_175_UZL',  // Service code (registered only)
              c5: '2.5',          // Weight in kg (registered only)
              c9: 'DELIVERED',
              c10: '2025-01-27 14:30:00',
              c41: '20',          // Length (registered only)
              c42: '15',          // Width (registered only)
              c43: '10',          // Height
              c58: '50000',       // Declared value in HUF (registered only)
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/registered'),
        mockResponse
      );

      const { trackRegistered } = await import('../capabilities/track.js');

      const request = {
        trackingNumbers: [trackingNumber],
        credentials: {
          authType: 'apiKey' as const,
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
        state: 'last' as const,
        useRegisteredEndpoint: false,
      };

      const result = await trackRegistered(request, ctx, (opts) => 'https://api.test');

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0].trackingNumber).toBe(trackingNumber);
      expect(result[0].status).toBe('DELIVERED');
      // Check that financial data is included in raw response
      expect((result[0].rawCarrierResponse as any)?.record?.c2).toBe('A_175_UZL');
      expect((result[0].rawCarrierResponse as any)?.record?.c5).toBe('2.5');
      expect((result[0].rawCarrierResponse as any)?.record?.c41).toBe('20');
    });

    it('should use registered endpoint URL', async () => {
      const trackingNumber = 'CLREG123456';
      const mockResponse: HttpResponse<any> = {
        status: 200,
        headers: {},
        body: {
          trackAndTrace: [
            {
              c1: trackingNumber,
              c9: 'DELIVERED',
              c10: '2025-01-27 14:30:00',
            },
          ],
        },
      };

      mockHttp.setResponseMatcher(
        (url) => url.includes('/nyomkovetes/registered'),
        mockResponse
      );

      const { trackRegistered } = await import('../capabilities/track.js');

      const request = {
        trackingNumbers: [trackingNumber],
        credentials: {
          authType: 'apiKey' as const,
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          accountingCode: 'TEST001',
        },
        state: 'last' as const,
        useRegisteredEndpoint: false,
      };

      const result = await trackRegistered(request, ctx, (opts) => 'https://api.test');

      // Verify the URL used contains 'registered' endpoint
      expect(mockHttp.lastGetUrl).toContain('/nyomkovetes/registered');
    });
  });
});
