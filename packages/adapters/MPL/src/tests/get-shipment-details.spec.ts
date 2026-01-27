import { describe, it, expect, beforeEach } from 'vitest';
import { getShipmentDetails, ShipmentDetailsResponse } from '../capabilities/get-shipment-details.js';
import type { AdapterContext, HttpResponse, Logger } from '@shopickup/core';
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

  setError(error: Error): void {
    this.throwError = error;
  }

  async post<T>(_url: string, _data: any, _options?: any): Promise<HttpResponse<T>> {
    throw new Error('POST not implemented in mock');
  }

  async get<T>(url: string, options?: any): Promise<HttpResponse<T>> {
    this.lastGetUrl = url;
    this.lastGetOptions = options;

    if (this.throwError) {
      throw this.throwError;
    }

    const response = this.responses.get(url);
    if (response) {
      return response as HttpResponse<T>;
    }

    throw new Error(`No mock response configured for ${url}`);
  }

  async put<T>(_url: string, _data?: any, _options?: any): Promise<HttpResponse<T>> {
    throw new Error('PUT not implemented in mock');
  }

  async patch<T>(_url: string, _data?: any, _options?: any): Promise<HttpResponse<T>> {
    throw new Error('PATCH not implemented in mock');
  }

  async delete<T>(_url: string, _options?: any): Promise<HttpResponse<T>> {
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
}

describe('getShipmentDetails()', () => {
  let httpClient: MockHttpClient;
  let logger: MockLogger;
  let ctx: AdapterContext;

  const testCredentials = {
    authType: 'apiKey' as const,
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    accountingCode: 'TEST123',
  };

  const resolveBaseUrl = (opts?: any) =>
    opts?.useTestApi ? 'https://sandbox.api.posta.hu/v2/mplapi' : 'https://core.api.posta.hu/v2/mplapi';

  beforeEach(() => {
    httpClient = new MockHttpClient();
    logger = new MockLogger();
    ctx = {
      http: httpClient,
      logger,
    };
  });

  it('should retrieve shipment details successfully', async () => {
    const trackingNumber = '12345678';
    const mockResponse = {
      body: {
        shipment: {
          trackingNumber,
          orderId: 'ORDER-001',
          shipmentDate: '2025-01-27T10:00:00Z',
          sender: {
            name: 'Test Sender',
            city: 'Budapest',
            country: 'HU',
          },
          recipient: {
            name: 'Test Recipient',
            city: 'Debrecen',
            country: 'HU',
          },
          items: [{ id: 'ITEM-1', weight: 1.5 }],
        },
        errors: [],
        metadata: { timestamp: new Date().toISOString() },
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    const result: ShipmentDetailsResponse = await getShipmentDetails(request, ctx, resolveBaseUrl);

    expect(result.trackingNumber).toBe(trackingNumber);
    expect(result.orderId).toBe('ORDER-001');
    expect(result.sender?.name).toBe('Test Sender');
    expect(result.recipient?.name).toBe('Test Recipient');
    expect(result.items).toHaveLength(1);
    expect(result.raw).toBeDefined();
  });

  it('should return null for optional fields when not present', async () => {
    const trackingNumber = '12345678';
    const mockResponse = {
      body: {
        shipment: {
          trackingNumber,
          sender: { name: 'Sender' },
          recipient: { name: 'Recipient', city: 'Budapest' },
          items: [],
        },
        errors: [],
        metadata: {},
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    const result = await getShipmentDetails(request, ctx, resolveBaseUrl);

    expect(result.trackingNumber).toBe(trackingNumber);
    expect(result.orderId).toBeUndefined();
    expect(result.shipmentDate).toBeUndefined();
  });

  it('should URL-encode tracking number in request', async () => {
    const trackingNumber = 'TRACK-123-456';
    const mockResponse = {
      body: {
        shipment: {
          trackingNumber,
          sender: { name: 'Sender' },
          recipient: { name: 'Recipient', city: 'Budapest' },
          items: [],
        },
        errors: [],
        metadata: {},
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${encodeURIComponent(trackingNumber)}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    await getShipmentDetails(request, ctx, resolveBaseUrl);

    expect(httpClient.lastGetUrl).toContain(encodeURIComponent(trackingNumber));
  });

  it('should include required headers in request', async () => {
    const trackingNumber = '12345678';
    const mockResponse = {
      body: {
        shipment: {
          trackingNumber,
          sender: { name: 'Sender' },
          recipient: { name: 'Recipient', city: 'Budapest' },
          items: [],
        },
        errors: [],
        metadata: {},
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    await getShipmentDetails(request, ctx, resolveBaseUrl);

    expect(httpClient.lastGetOptions).toBeDefined();
    expect(httpClient.lastGetOptions.headers).toBeDefined();
    expect(httpClient.lastGetOptions.headers['X-Request-ID']).toBeDefined();
    expect(httpClient.lastGetOptions.headers['X-Accounting-Code']).toBe('TEST123');
    expect(httpClient.lastGetOptions.headers['Authorization']).toBeDefined();
  });

  it('should throw CarrierError when shipment not found', async () => {
    const trackingNumber = '99999999';
    const mockResponse = {
      body: {
        errors: [{ code: 'NOT_FOUND', text: 'Shipment not found' }],
        metadata: {},
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    await expect(getShipmentDetails(request, ctx, resolveBaseUrl)).rejects.toThrow(CarrierError);
  });

  it('should throw CarrierError when no shipment in response', async () => {
    const trackingNumber = '12345678';
    const mockResponse = {
      body: {
        shipment: null,
        errors: [],
        metadata: {},
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    await expect(getShipmentDetails(request, ctx, resolveBaseUrl)).rejects.toThrow(CarrierError);
  });

  it('should throw CarrierError when accountingCode missing', async () => {
    const trackingNumber = '12345678';
    const request = {
      trackingNumber,
      credentials: {
        authType: 'apiKey' as const,
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        // No accountingCode
      } as any,
    };

    await expect(getShipmentDetails(request, ctx, resolveBaseUrl)).rejects.toThrow(CarrierError);
  });

  it('should throw CarrierError when HTTP client not provided', async () => {
    const trackingNumber = '12345678';
    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    const ctxWithoutHttp: AdapterContext = {
      logger,
      // No http client
    };

    await expect(getShipmentDetails(request, ctxWithoutHttp, resolveBaseUrl)).rejects.toThrow(CarrierError);
  });

  it('should log debug message on retrieval attempt', async () => {
    const trackingNumber = '12345678';
    const mockResponse = {
      body: {
        shipment: {
          trackingNumber,
          sender: { name: 'Sender' },
          recipient: { name: 'Recipient', city: 'Budapest' },
          items: [],
        },
        errors: [],
        metadata: {},
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    await getShipmentDetails(request, ctx, resolveBaseUrl);

    const debugLog = logger.logs.find((l) => l.level === 'debug' && l.msg.includes('details'));
    expect(debugLog).toBeDefined();
    expect(debugLog?.data.trackingNumber).toBe(trackingNumber);
  });

  it('should log info message on successful retrieval', async () => {
    const trackingNumber = '12345678';
    const mockResponse = {
      body: {
        shipment: {
          trackingNumber,
          shipmentDate: '2025-01-27T10:00:00Z',
          sender: { name: 'Sender' },
          recipient: { name: 'Recipient', city: 'Budapest' },
          items: [{ id: 'ITEM-1' }],
        },
        errors: [],
        metadata: {},
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    await getShipmentDetails(request, ctx, resolveBaseUrl);

    const infoLog = logger.logs.find((l) => l.level === 'info' && l.msg.includes('retrieved'));
    expect(infoLog).toBeDefined();
    expect(infoLog?.data.trackingNumber).toBe(trackingNumber);
  });

  it('should handle test mode API endpoint', async () => {
    const trackingNumber = '12345678';
    const mockResponse = {
      body: {
        shipment: {
          trackingNumber,
          sender: { name: 'Sender' },
          recipient: { name: 'Recipient', city: 'Budapest' },
          items: [],
        },
        errors: [],
        metadata: {},
      },
    };

    httpClient.setResponse(
      `https://sandbox.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
      options: { useTestApi: true },
    };

    const result = await getShipmentDetails(request, ctx, resolveBaseUrl);

    expect(result.trackingNumber).toBe(trackingNumber);
    expect(httpClient.lastGetUrl).toContain('sandbox.api.posta.hu');
  });

  it('should include shipment details in raw response', async () => {
    const trackingNumber = '12345678';
    const mockResponse = {
      body: {
        shipment: {
          trackingNumber,
          orderId: 'ORD-001',
          tag: 'TAG-001',
          sender: { name: 'Sender' },
          recipient: { name: 'Recipient' },
          items: [
            { id: 'ITEM-1', weight: 1.0 },
            { id: 'ITEM-2', weight: 2.0 },
          ],
        },
        errors: [],
        metadata: { timestamp: '2025-01-27T11:00:00Z' },
      },
    };

    httpClient.setResponse(
      `https://core.api.posta.hu/v2/mplapi/shipments/${trackingNumber}`,
      mockResponse
    );

    const request = {
      trackingNumber,
      credentials: testCredentials,
    };

    const result = await getShipmentDetails(request, ctx, resolveBaseUrl);

    expect(result.raw.shipment).toEqual(mockResponse.body.shipment);
    expect(result.raw.errors).toEqual([]);
    expect(result.raw.metadata).toBeDefined();
  });

  it('should handle invalid request format', async () => {
    const request: any = {
      // Missing trackingNumber
      credentials: testCredentials,
    };

    await expect(getShipmentDetails(request, ctx, resolveBaseUrl)).rejects.toThrow(CarrierError);
  });
});
