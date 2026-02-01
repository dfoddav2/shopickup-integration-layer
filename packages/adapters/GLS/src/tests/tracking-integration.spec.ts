/**
 * GLS Tracking Integration Tests
 * 
 * Comprehensive end-to-end tests for GLS tracking capability including:
 * - Real-world scenario testing
 * - POD (Proof of Delivery) handling
 * - Error scenarios
 * - Status code transitions
 * - Language support
 * - Edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AdapterContext, TrackingRequest, HttpClient, HttpResponse, HttpClientConfig } from '@shopickup/core';
import { CarrierError } from '@shopickup/core';
import { track } from '../capabilities/tracking.js';

/**
 * Mock HTTP client for testing
 */
class MockHTTPClient implements HttpClient {
  private responses: Map<string, unknown> = new Map();
  private requestLog: Array<{ url: string; method: string; body?: unknown }> = [];

  setResponse(path: string, response: unknown) {
    this.responses.set(path, response);
  }

  getRequestLog() {
    return this.requestLog;
  }

  clearLog() {
    this.requestLog = [];
  }

  private getResponseByUrl(url: string): unknown {
    // Extract path from URL for response lookup
    const path = new URL(url).pathname;
    const response = this.responses.get(path);

    if (!response) {
      throw new Error(`No mock response set for ${path}`);
    }

    if (response instanceof Error) {
      throw response;
    }

    return response;
  }

  async get<T = unknown>(url: string, _config?: HttpClientConfig): Promise<HttpResponse<T>> {
    this.requestLog.push({ url, method: 'GET' });
    const body = this.getResponseByUrl(url) as T;
    return { status: 200, body, headers: {} };
  }

  async post<T = unknown>(url: string, data?: unknown, _config?: HttpClientConfig): Promise<HttpResponse<T>> {
    this.requestLog.push({ url, method: 'POST', body: data });
    const body = this.getResponseByUrl(url) as T;
    return { status: 200, body, headers: {} };
  }

  async put<T = unknown>(url: string, data?: unknown, _config?: HttpClientConfig): Promise<HttpResponse<T>> {
    this.requestLog.push({ url, method: 'PUT', body: data });
    const body = this.getResponseByUrl(url) as T;
    return { status: 200, body, headers: {} };
  }

  async patch<T = unknown>(url: string, data?: unknown, _config?: HttpClientConfig): Promise<HttpResponse<T>> {
    this.requestLog.push({ url, method: 'PATCH', body: data });
    const body = this.getResponseByUrl(url) as T;
    return { status: 200, body, headers: {} };
  }

  async delete<T = unknown>(url: string, _config?: HttpClientConfig): Promise<HttpResponse<T>> {
    this.requestLog.push({ url, method: 'DELETE' });
    const body = this.getResponseByUrl(url) as T;
    return { status: 200, body, headers: {} };
  }
}

/**
 * Create a mock AdapterContext
 */
function createMockContext(httpClient?: unknown): AdapterContext {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    http: httpClient as any,
  } as unknown as AdapterContext;
}

/**
 * ============================================
 * Integration Test Suite
 * ============================================
 */

describe('GLS Tracking Integration Tests', () => {
  let mockHttpClient: MockHTTPClient;
  let mockContext: AdapterContext;

  beforeEach(() => {
    mockHttpClient = new MockHTTPClient();
    mockContext = createMockContext(mockHttpClient);
  });

  describe('Successful Tracking Scenarios', () => {
    it('should track parcel pending delivery with multiple status updates', async () => {
      // Setup mock response for pending parcel
      const mockResponse = { ParcelNumber: 123456789,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-15T08:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
           {
             StatusCode: '22',
             StatusDescription: 'In transit',
             StatusDate: '2024-01-15T10:30:00Z',
             DepotCity: 'Budapest',
             DepotNumber: '0001',
           },
          {
            StatusCode: '32',
            StatusDescription: 'Will be delivered in evening',
            StatusDate: '2024-01-15T16:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '123456789',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: {
          useTestApi: true,
          country: 'HU',
        },
      };

      const result = await track(request, mockContext);

      expect(result).toBeDefined();
      expect(result.trackingNumber).toBe('123456789');
      expect(result.events).toBeDefined();
      expect(result.events.length).toBe(3);
      expect(result.events[0].status).toBe('PENDING');
      expect(result.events[1].status).toBe('IN_TRANSIT');
      expect(result.events[2].status).toBe('OUT_FOR_DELIVERY');
      // Events should be sorted chronologically
      expect(result.events[0].timestamp.getTime()).toBeLessThan(result.events[1].timestamp.getTime());
      expect(result.events[1].timestamp.getTime()).toBeLessThan(result.events[2].timestamp.getTime());
      expect(result.status).toBe('OUT_FOR_DELIVERY');
    });

    it('should track successfully delivered parcel', async () => {
      const mockResponse = { ParcelNumber: 987654321,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-14T08:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
          {
            StatusCode: '5',
            StatusDescription: 'Delivered',
            StatusDate: '2024-01-14T14:30:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
            recipientName: 'John Doe',
            recipientCity: 'Budapest',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '987654321',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true, country: 'HU' },
      };

      const result = await track(request, mockContext);

      expect(result.status).toBe('DELIVERED');
      expect(result.events).toHaveLength(2);
      expect(result.events[result.events.length - 1].status).toBe('DELIVERED');
    });

    it('should track parcel with exception status', async () => {
      const mockResponse = { ParcelNumber: 555666777,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-13T08:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
          {
            StatusCode: '6',
            StatusDescription: 'Stored in parcel center (exception)',
            StatusDate: '2024-01-13T15:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '555666777',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      const result = await track(request, mockContext);

      expect(result.status).toBe('EXCEPTION');
      expect(result.events[result.events.length - 1].status).toBe('EXCEPTION');
    });

    it('should track parcel with returned status', async () => {
      const mockResponse = { ParcelNumber: 111222333,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-10T08:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
           {
             StatusCode: '23',
             StatusDescription: 'Returned to sender',
             StatusDate: '2024-01-12T10:00:00Z',
             DepotCity: 'Budapest',
             DepotNumber: '0001',
           },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '111222333',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      const result = await track(request, mockContext);

      expect(result.status).toBe('RETURNED');
      expect(result.events[result.events.length - 1].status).toBe('RETURNED');
    });
  });

  describe('POD (Proof of Delivery) Handling', () => {
    it('should include POD in response when requested', async () => {
      const podBase64 = 'JVBERi0xLjQNCiXi48/PIA0K'; // Base64 encoded PDF bytes

      const mockResponse = { ParcelNumber: 444555666,
        ParcelStatusList: [
          {
            StatusCode: '5',
            StatusDescription: 'Delivered',
            StatusDate: '2024-01-12T14:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
            recipientName: 'Jane Smith',
          },
        ],
        pod: Buffer.from(podBase64, 'base64'),
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '444555666',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: {
          useTestApi: true,
          returnPOD: true,
        },
      };

      const result = await track(request, mockContext);

      expect(result.rawCarrierResponse).toBeDefined();
      expect((result.rawCarrierResponse as any)?.pod).toBeDefined();
    });

    it('should handle POD as Uint8Array', async () => {
      const podBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

      const mockResponse = { ParcelNumber: 777888999,
        ParcelStatusList: [
          {
            StatusCode: '5',
            StatusDescription: 'Delivered',
            StatusDate: '2024-01-11T16:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        pod: podBytes,
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '777888999',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true, returnPOD: true },
      };

      const result = await track(request, mockContext);

      expect(result.rawCarrierResponse).toBeDefined();
      expect((result.rawCarrierResponse as any)?.pod).toBeDefined();
    });

    it('should handle POD as number array', async () => {
      const podBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

      const mockResponse = { ParcelNumber: 333444555,
        ParcelStatusList: [
          {
            StatusCode: '5',
            StatusDescription: 'Delivered',
            StatusDate: '2024-01-10T10:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        pod: podBuffer,
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '333444555',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true, returnPOD: true },
      };

      const result = await track(request, mockContext);

      expect(result.rawCarrierResponse).toBeDefined();
      expect((result.rawCarrierResponse as any)?.pod).toBeDefined();
    });

    it('should handle missing POD gracefully', async () => {
      const mockResponse = { ParcelNumber: 666777888,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-10T08:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
         ],
         GetParcelStatusErrors: undefined,
       };

       mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '666777888',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true, returnPOD: true },
      };

      // Should not throw - POD is optional
      const result = await track(request, mockContext);

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
    });
  });

  describe('Language Support', () => {
    it('should support Hungarian language code', async () => {
      const mockResponse = { ParcelNumber: 888999000,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Átadva a GLS-nek',
            StatusDate: '2024-01-15T08:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '888999000',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true, languageIsoCode: 'HU' },
      };

      const result = await track(request, mockContext);

      expect(result).toBeDefined();
      expect(result.events[0].description).toContain('Átadva');
    });

    it('should support English language code', async () => {
      const mockResponse = { ParcelNumber: 111222333,
        ParcelStatusList: [
          {
            StatusCode: '22',
            StatusDescription: 'In transit',
            StatusDate: '2024-01-15T10:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '111222333',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true, languageIsoCode: 'EN' },
      };

      const result = await track(request, mockContext);

      expect(result).toBeDefined();
      expect(result.events[0].status).toBe('IN_TRANSIT');
    });

    it('should support Czech language code', async () => {
      const request: TrackingRequest = {
        trackingNumber: '999888777',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true, languageIsoCode: 'CS' },
      };

      // Valid request should not throw with CS language
      const mockResponse = { ParcelNumber: 999888777,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Předáno GLS',
            StatusDate: '2024-01-15T08:00:00Z',
            DepotCity: 'Prague',
            DepotNumber: '0002',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const result = await track(request, mockContext);
      expect(result).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should throw CarrierError for invalid tracking number (non-numeric)', async () => {
      const request: TrackingRequest = {
        trackingNumber: 'INVALID-NUMBER',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError for negative tracking number', async () => {
      const request: TrackingRequest = {
        trackingNumber: '-12345',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError for zero tracking number', async () => {
      const request: TrackingRequest = {
        trackingNumber: '0',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError when credentials are missing', async () => {
      const request: TrackingRequest = {
        trackingNumber: '123456789',
        credentials: undefined,
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError when username is missing', async () => {
      const request: TrackingRequest = {
        trackingNumber: '123456789',
        credentials: {
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError when password is missing', async () => {
      const request: TrackingRequest = {
        trackingNumber: '123456789',
        credentials: {
          username: 'test@example.com',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError when clientNumberList is missing', async () => {
      const request: TrackingRequest = {
        trackingNumber: '123456789',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError when clientNumberList is empty', async () => {
      const request: TrackingRequest = {
        trackingNumber: '123456789',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError on HTTP request failure', async () => {
      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', new Error('Network error'));

      const request: TrackingRequest = {
        trackingNumber: '123456789',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow();
    });

    it('should throw CarrierError when GLS API returns error', async () => {
      const mockResponse = { ParcelNumber: 123456789,
        ParcelStatusList: [],
        GetParcelStatusErrors: 'Authentication failed',
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '123456789',
        credentials: {
          username: 'wrong@example.com',
          password: 'wrongpass',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should throw CarrierError when parcel not found', async () => {
      const mockResponse = { ParcelNumber: null,
        ParcelStatusList: [],
        GetParcelStatusErrors: 'Parcel not found',
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '999999999',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });
  });

  describe('Edge Cases and Special Scenarios', () => {
    it('should handle parcel with single status update', async () => {
      const mockResponse = { ParcelNumber: 123123123,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-15T08:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '123123123',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      const result = await track(request, mockContext);

      expect(result.events).toHaveLength(1);
      expect(result.status).toBe('PENDING');
    });

    it('should handle parcel with many status updates', async () => {
      const statuses = [];
      for (let i = 0; i < 10; i++) {
        statuses.push({
          StatusCode: String((i % 5) + 1),
          StatusDescription: `Status update ${i + 1}`,
          StatusDate: new Date(2024, 0, 15 + i).toISOString(),
          DepotCity: 'Budapest',
          DepotNumber: '0001',
        });
      }

      const mockResponse = { ParcelNumber: 222222222,
        ParcelStatusList: statuses,
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '222222222',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      const result = await track(request, mockContext);

      expect(result.events.length).toBeGreaterThan(1);
      // Should be sorted chronologically
      for (let i = 1; i < result.events.length; i++) {
        expect(result.events[i - 1].timestamp.getTime()).toBeLessThanOrEqual(result.events[i].timestamp.getTime());
      }
    });

    it('should handle missing optional fields in status', async () => {
      const mockResponse = { ParcelNumber: 333333333,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-15T08:00:00Z',
            // DepotCity and DepotNumber are optional
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '333333333',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      const result = await track(request, mockContext);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].status).toBe('PENDING');
    });

    it('should handle large tracking number', async () => {
      const largeNumber = '999999999999999';

      const mockResponse = { ParcelNumber: parseInt(largeNumber),
        ParcelStatusList: [
          {
            StatusCode: '5',
            StatusDescription: 'Delivered',
            StatusDate: '2024-01-15T14:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: largeNumber,
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      const result = await track(request, mockContext);

      expect(result.trackingNumber).toBe(largeNumber);
      expect(result.status).toBe('DELIVERED');
    });

    it('should preserve raw GLS response', async () => {
      const mockResponse = { ParcelNumber: 444444444,
        ParcelStatusList: [
          {
            StatusCode: '5',
            StatusDescription: 'Delivered',
            StatusDate: '2024-01-15T14:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        GetParcelStatusErrors: undefined,
        CustomField: 'custom value', // Extra field that should be preserved
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '444444444',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      const result = await track(request, mockContext);

      expect(result.rawCarrierResponse).toBeDefined();
      // Raw response should contain original GLS response data
    });

    it('should handle multiple client numbers in credentials', async () => {
      const mockResponse = { ParcelNumber: 555555555,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-15T08:00:00Z',
            DepotCity: 'Budapest',
            DepotNumber: '0001',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '555555555',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345, 67890, 11111], // Multiple client numbers
        },
        options: { useTestApi: true },
      };

      // Should use first client number
      const result = await track(request, mockContext);

      expect(result).toBeDefined();
      expect(result.status).toBe('PENDING');
    });
  });

  describe('Request Validation in Integration Context', () => {
    it('should validate empty tracking number', async () => {
      const request: TrackingRequest = {
        trackingNumber: '',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      await expect(track(request, mockContext)).rejects.toThrow(CarrierError);
    });

    it('should validate tracking number with spaces', async () => {
      const request: TrackingRequest = {
        trackingNumber: '  123456789  ',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true },
      };

      // Should handle spaces in tracking number
      await expect(track(request, mockContext)).rejects.toThrow();
    });

    it('should work with different country codes', async () => {
      const mockResponse = { ParcelNumber: 666666666,
        ParcelStatusList: [
          {
            StatusCode: '1',
            StatusDescription: 'Handed over to GLS',
            StatusDate: '2024-01-15T08:00:00Z',
            DepotCity: 'Prague',
            DepotNumber: '0002',
          },
        ],
        GetParcelStatusErrors: undefined,
      };

      mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

      const request: TrackingRequest = {
        trackingNumber: '666666666',
        credentials: {
          username: 'test@example.com',
          password: 'testpass123',
          clientNumberList: [12345],
        },
        options: { useTestApi: true, country: 'CZ' },
      };

      const result = await track(request, mockContext);

      expect(result).toBeDefined();
      expect(result.events[0].location?.city).toBe('Prague');
    });
  });

  describe('Status Code Consistency', () => {
    it('should map all common GLS status codes consistently', async () => {
      const commonCodes = [
        { code: '1', expectedStatus: 'PENDING' },
        { code: '2', expectedStatus: 'IN_TRANSIT' },
        { code: '5', expectedStatus: 'DELIVERED' },
        { code: '6', expectedStatus: 'EXCEPTION' },
        { code: '23', expectedStatus: 'RETURNED' },
      ];

      for (const { code, expectedStatus } of commonCodes) {
        const mockResponse = { ParcelNumber: 777777777 + parseInt(code),
          ParcelStatusList: [
            {
              StatusCode: code,
              StatusDescription: `Test status ${code}`,
              StatusDate: '2024-01-15T08:00:00Z',
              DepotCity: 'Budapest',
              DepotNumber: '0001',
            },
          ],
          GetParcelStatusErrors: undefined,
        };

        mockHttpClient.setResponse('/ParcelService.svc/json/GetParcelStatuses', mockResponse);

        const request: TrackingRequest = {
          trackingNumber: String(777777777 + parseInt(code)),
          credentials: {
            username: 'test@example.com',
            password: 'testpass123',
            clientNumberList: [12345],
          },
          options: { useTestApi: true },
        };

        const result = await track(request, mockContext);

        expect(result.events[0].status).toBe(expectedStatus);
      }
    });
  });
});
