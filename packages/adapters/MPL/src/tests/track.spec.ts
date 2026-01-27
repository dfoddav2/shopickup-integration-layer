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

  setResponse(url: string, data: any): void {
    this.responses.set(url, data);
  }

  setResponseMatcher(matcher: (url: string) => boolean, data: any): void {
    (this.responses as any).matcher = { matcher, data };
  }

  setError(error: Error): void {
    this.throwError = error;
  }

  async post<T>(_url: string, _data: any, _options?: any): Promise<HttpResponse<T>> {
    throw new Error('POST not implemented in mock');
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
});
