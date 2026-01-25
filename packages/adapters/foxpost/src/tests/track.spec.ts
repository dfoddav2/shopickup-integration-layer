import { describe, it, expect, beforeEach } from 'vitest';
import { FoxpostAdapter } from '../index.js';
import type { AdapterContext, TrackingRequest } from '@shopickup/core';
import type { TrackingResponse } from '../types/generated.js';

/**
 * Mock HTTP Client for tracking tests
 */
class MockHttpClientTrack {
  lastUrl?: string;

  async get<T>(url: string, _options?: any): Promise<T> {
    this.lastUrl = url;

    // Mock new /api/tracking/{barcode} endpoint response
    if (url.includes("/api/tracking/")) {
      const response: TrackingResponse = {
        clFox: "CLFOX0000000001",
        estimatedDelivery: "2024-01-20",
        parcelType: "NORMAL",
        sendType: "HD",
        relatedParcel: null,
        traces: [
          {
            status: "RECEIVE",
            shortName: "RECEIVE",
            longName: "Delivered to recipient",
            statusDate: "2024-01-18T10:00:00Z",
            statusStatidionId: "bp-main",
          },
          {
            status: "HDINTRANSIT",
            shortName: "INTRAN",
            longName: "Out for delivery",
            statusDate: "2024-01-17T15:00:00Z",
            statusStatidionId: "bp-courier",
          },
          {
            status: "HDSENT",
            shortName: "SENT",
            longName: "Handed to courier",
            statusDate: "2024-01-17T08:00:00Z",
            statusStatidionId: "bp-facility",
          },
          {
            status: "CREATE",
            shortName: "CREATE",
            longName: "Parcel created",
            statusDate: "2024-01-16T10:00:00Z",
            statusStatidionId: "bp-main",
          },
        ],
      };
      return { status: 200, headers: {}, body: response } as unknown as T;
    }

    throw new Error(`Unexpected GET: ${url}`);
  }

  async post<T>(_url: string, _data?: any, _options?: any): Promise<T> {
    throw new Error("POST not implemented in mock");
  }

  async put<T>(_url: string, _data?: any, _options?: any): Promise<T> {
    throw new Error("PUT not implemented in mock");
  }

  async patch<T>(_url: string, _data?: any, _options?: any): Promise<T> {
    throw new Error("PATCH not implemented in mock");
  }

  async delete<T>(_url: string, _options?: any): Promise<T> {
    throw new Error("DELETE not implemented in mock");
  }
}

describe('FoxpostAdapter track', () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClientTrack;
  let ctx: AdapterContext;

  beforeEach(() => {
    adapter = new FoxpostAdapter('https://webapi-test.foxpost.hu');
    mockHttp = new MockHttpClientTrack();
    ctx = { http: mockHttp as any, logger: console };
  });

  it('tracks a parcel using typed TrackingResponse', async () => {
    const req: TrackingRequest = {
      trackingNumber: 'CLFOX0000000001',
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
    };
    const result = await adapter.track!(req, ctx);

    expect(result).toBeDefined();
    expect(result.trackingNumber).toBe('CLFOX0000000001');
    expect(result.status).toBe('DELIVERED');
    expect(Array.isArray(result.events)).toBe(true);
  });

  it('returns events in chronological order (oldest first)', async () => {
    const req: TrackingRequest = {
      trackingNumber: 'CLFOX0000000001',
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
    };
    const result = await adapter.track!(req, ctx);

    expect(result.events).toHaveLength(4);
    
    // Events should be in chronological order (oldest to newest)
    // Descriptions should be from mapped status, not API's longName
    expect(result.events[0].description).toBe('Order created');
    expect(result.events[1].description).toBe('Home delivery sent');
    expect(result.events[2].description).toBe('Out for home delivery');
    expect(result.events[3].description).toBe('Delivered to recipient');
  });

  it('uses current status from latest trace (API returns latest first)', async () => {
    const req: TrackingRequest = {
      trackingNumber: 'CLFOX0000000001',
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
    };
    const result = await adapter.track!(req, ctx);

    // Current status should be DELIVERED (from latest trace)
    expect(result.status).toBe('DELIVERED');
  });

  it('includes raw carrier response', async () => {
    const req: TrackingRequest = {
      trackingNumber: 'CLFOX0000000001',
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
    };
    const result = await adapter.track!(req, ctx);

    expect(result.rawCarrierResponse).toBeDefined();
    const rawResponse = result.rawCarrierResponse as TrackingResponse;
    expect(rawResponse.clFox).toBe('CLFOX0000000001');
    expect(rawResponse.estimatedDelivery).toBe('2024-01-20');
    expect(rawResponse.parcelType).toBe('NORMAL');
    expect(rawResponse.sendType).toBe('HD');
  });

    it('maps all trace fields to TrackingEvent', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000001',
        credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
      };
      const result = await adapter.track!(req, ctx);

      // Check that all traces were properly mapped
      const lastEvent = result.events[result.events.length - 1];
      expect(lastEvent.timestamp).toBeInstanceOf(Date);
      expect(lastEvent.status).toBe('DELIVERED');
      // Should use mapped description from status map, not API's longName
      expect(lastEvent.description).toBe('Delivered to recipient');
      expect(lastEvent.raw).toBeDefined();
      // Verify carrierStatusCode preserves original Foxpost status
      expect(lastEvent.carrierStatusCode).toBe('RECEIVE');
      // Verify Hungarian description is included
      expect(lastEvent.descriptionLocalLanguage).toBe('Átvéve');
    });

   it('uses test API when useTestApi option is true', async () => {
     const req: TrackingRequest = {
       trackingNumber: 'CLFOX0000000001',
       credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
       options: { useTestApi: true },
     };

     const result = await adapter.track!(req, ctx);

     expect(result).toBeDefined();
     // URL should use test API base URL
     expect(mockHttp.lastUrl).toContain('webapi-test.foxpost.hu');
   });

   it('throws error when response has no clFox', async () => {
     const mockHttpBad = new (class extends MockHttpClientTrack {
       async get<T>(): Promise<T> {
         return { status: 200, headers: {}, body: { traces: [] } } as unknown as T;
       }
     })();

     ctx.http = mockHttpBad as any;
     const req: TrackingRequest = {
       trackingNumber: 'INVALID',
       credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
     };

     await expect(adapter.track!(req, ctx)).rejects.toThrow('No tracking information found');
   });

   it('throws error when traces array is missing', async () => {
     const mockHttpBad = new (class extends MockHttpClientTrack {
       async get<T>(): Promise<T> {
         return { status: 200, headers: {}, body: { clFox: 'CLFOX123' } } as unknown as T;
       }
     })();

     ctx.http = mockHttpBad as any;
     const req: TrackingRequest = {
       trackingNumber: 'CLFOX123',
       credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
     };

     await expect(adapter.track!(req, ctx)).rejects.toThrow('Invalid tracking response');
   });

  it('throws error when HTTP client is not provided', async () => {
    const ctxNoHttp = { logger: console };
    const req: TrackingRequest = {
      trackingNumber: 'CLFOX123',
      credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
    };

    await expect(adapter.track!(req, ctxNoHttp as any)).rejects.toThrow(
      'HTTP client not provided'
    );
  });

   it('uses correct URL format for new tracking endpoint', async () => {
     const req: TrackingRequest = {
       trackingNumber: 'CLFOX0000000001',
       credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
       options: { useTestApi: true },
     };

     await adapter.track!(req, ctx);

     expect(mockHttp.lastUrl).toBe('https://webapi-test.foxpost.hu/api/tracking/CLFOX0000000001');
   });

   it('maps status codes correctly (RECEIVE -> DELIVERED)', async () => {
     const req: TrackingRequest = {
       trackingNumber: 'CLFOX0000000001',
       credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
     };
     const result = await adapter.track!(req, ctx);

     // Find the RECEIVE event and verify it maps to DELIVERED
     const deliveredEvent = result.events.find(e => e.description === 'Delivered to recipient');
     expect(deliveredEvent).toBeDefined();
     expect(deliveredEvent!.status).toBe('DELIVERED');
     // Verify carrierStatusCode preserves original Foxpost code
     expect(deliveredEvent!.carrierStatusCode).toBe('RECEIVE');
   });

    it('preserves carrierStatusCode for all events', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000001',
        credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
      };
      const result = await adapter.track!(req, ctx);

       result.events.forEach((event, idx) => {
         expect(event.carrierStatusCode).toBeDefined();
         // carrierStatusCode should be a non-empty string
         expect(typeof event.carrierStatusCode).toBe('string');
         expect(event.carrierStatusCode!.length).toBeGreaterThan(0);
       });
    });

    it('includes human-readable descriptions for all events', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000001',
        credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
      };
      const result = await adapter.track!(req, ctx);

      result.events.forEach(event => {
        expect(event.description).toBeDefined();
        expect(typeof event.description).toBe('string');
        expect(event.description.length).toBeGreaterThan(0);
      });
    });

    it('includes Hungarian descriptions (descriptionLocalLanguage) for known statuses', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000001',
        credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
      };
      const result = await adapter.track!(req, ctx);

      // Should have mapped descriptions for known Foxpost codes
      const events = result.events;
      expect(events).toHaveLength(4);

      // CREATE should have Hungarian description
      const createEvent = events.find(e => e.carrierStatusCode === 'CREATE');
      expect(createEvent).toBeDefined();
      expect(createEvent!.descriptionLocalLanguage).toBe('Rendelés létrehozva');

      // RECEIVE should have Hungarian description
      const receiveEvent = events.find(e => e.carrierStatusCode === 'RECEIVE');
      expect(receiveEvent).toBeDefined();
      expect(receiveEvent!.descriptionLocalLanguage).toBe('Átvéve');

      // HDINTRANSIT should have Hungarian description
      const hdintransitEvent = events.find(e => e.carrierStatusCode === 'HDINTRANSIT');
      expect(hdintransitEvent).toBeDefined();
      expect(hdintransitEvent!.descriptionLocalLanguage).toBe('Házhoz szállítás alatt');
    });

    it('maps status with mapped descriptions instead of API longName', async () => {
      const req: TrackingRequest = {
        trackingNumber: 'CLFOX0000000001',
        credentials: { apiKey: 'test-key', basicUsername: 'user', basicPassword: 'pass' },
      };
      const result = await adapter.track!(req, ctx);

      // The mock returns longName: "Out for delivery" for HDINTRANSIT
      // But we should map to "Out for home delivery" from the status map
      const hdintransitEvent = result.events.find(e => e.carrierStatusCode === 'HDINTRANSIT');
      expect(hdintransitEvent).toBeDefined();
      // Should use mapped description, not API's longName
      expect(hdintransitEvent!.description).toBe('Out for home delivery');
    });
});
