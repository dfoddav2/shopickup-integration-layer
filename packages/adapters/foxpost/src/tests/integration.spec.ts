/**
 * Integration tests for Foxpost adapter
 * Tests full flow: create parcel -> create label -> track
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { AdapterContext, Parcel, HttpClient } from "@shopickup/core";
import { FoxpostAdapter } from '../index.js';
import type { Statuses } from '../types/generated.js';

/**
 * Mock HttpClient for testing
 * In real integration tests, would use Prism mock server
 */
class MockHttpClient implements HttpClient {
  lastUrl?: string;
  lastMethod?: string;

  async post<T>(url: string, data?: any, options?: any): Promise<T> {
    this.lastUrl = url;
    this.lastMethod = 'POST';
    
    // Mock parcel creation response
    if (url.includes("/api/parcel")) {
      // Support batch requests: generate a response for each parcel in the request
      const requestArray = Array.isArray(data) ? data : [data];
      const parcels = requestArray.map((parcel: any, idx: number) => ({
        barcode: `CLFOX${String(idx + 1).padStart(10, '0')}`,
        refCode: parcel?.refCode,
        errors: [],
      }));
      return {
        valid: true,
        parcels,
      } as unknown as T;
    }
    throw new Error(`Unexpected POST: ${url}`);
  }

  async get<T>(url: string, options?: any): Promise<T> {
    this.lastUrl = url;
    this.lastMethod = 'GET';
    
    // Mock tracking response
    if (url.includes("/api/tracking/tracks/")) {
      return [
        {
          trackId: 1,
          status: "CREATE",
          statusDate: "2024-01-17T10:00:00Z",
          longName: "Parcel created",
        },
        {
          trackId: 2,
          status: "OPERIN",
          statusDate: "2024-01-17T15:00:00Z",
          longName: "In transit",
        },
        {
          trackId: 3,
          status: "RECEIVE",
          statusDate: "2024-01-18T10:00:00Z",
          longName: "Delivered",
        },
      ] as unknown as T;
    }

    // Mock label generation
    if (url.includes("/api/label")) {
      return Buffer.from("PDF_CONTENT_HERE") as unknown as T;
    }

    throw new Error(`Unexpected GET: ${url}`);
  }

  async put<T>(url: string, data?: any, options?: any): Promise<T> {
    throw new Error(`PUT not implemented in mock: ${url}`);
  }

  async patch<T>(url: string, data?: any, options?: any): Promise<T> {
    throw new Error(`PATCH not implemented in mock: ${url}`);
  }

  async delete<T>(url: string, options?: any): Promise<T> {
    throw new Error(`DELETE not implemented in mock: ${url}`);
  }
}

/**
 * Extended Mock HttpClient that tracks POST data for assertions
 */
class MockHttpClientWithTracking extends MockHttpClient {
  lastPostData?: any;

  async post<T>(url: string, data?: any, options?: any): Promise<T> {
    this.lastPostData = data;
    return super.post(url, data, options);
  }
}

// Helper: create a test parcel with all required fields
function createTestParcel(id: string = 'p1'): Parcel {
  return {
    id,
    shipper: {
      contact: {
        name: "Acme Corp",
        phone: "+36301111111",
        email: "sender@acme.com",
      },
      address: {
        name: "Acme Corp",
        street: "123 Business Ave",
        city: "Budapest",
        postalCode: "1011",
        country: "HU",
        phone: "+36301111111",
        email: "sender@acme.com",
      },
    },
    recipient: {
      contact: {
        name: "John Smith",
        phone: "+36302222222",
        email: "john@example.com",
      },
      delivery: {
        method: "HOME" as const,
        address: {
          name: "John Smith",
          street: "456 Customer St",
          city: "Debrecen",
          postalCode: "4024",
          country: "HU",
          phone: "+36302222222",
          email: "john@example.com",
        },
      },
    },
    package: {
      weightGrams: 1500,
      dimensionsCm: { length: 30, width: 20, height: 15 },
    },
    service: "standard" as const,
    references: {
      customerReference: "ORD-12345",
    },
  };
}

describe("FoxpostAdapter Integration", () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClient;
  let context: AdapterContext;

  const testParcel = createTestParcel();

  beforeAll(() => {
    adapter = new FoxpostAdapter("https://webapi.foxpost.hu");
    mockHttp = new MockHttpClient();
    context = { http: mockHttp, logger: console };
  });

  describe("Basic operations", () => {
    it("creates a parcel", async () => {
      const result = await adapter.createParcel!(
        {
          parcel: testParcel,
          credentials: { apiKey: "test-key", basicUsername: "user", basicPassword: "pass" },
        },
        context
      );

      expect(result).toBeDefined();
      expect(result.carrierId).toBe("CLFOX0000000001");
      expect(result.status).toBe("created");
    });

    it("creates a label for the parcel", async () => {
      const result = await adapter.createLabel!(
        "CLFOX0000000001",
        context
      );

      expect(result).toBeDefined();
      expect(result.carrierId).toBe("CLFOX0000000001");
      expect(result.status).toBe("created");
    });

    it("tracks the parcel", async () => {
      const result = await adapter.track!(
        "CLFOX0000000001",
        context
      );

      expect(result).toBeDefined();
      expect(result.trackingNumber).toBe("CLFOX0000000001");
      expect(Array.isArray(result.events)).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });
  });

  describe("Error handling", () => {
    it("throws error when HTTP client is not provided", async () => {
      const noHttpContext: AdapterContext = { logger: console };

      await expect(
        adapter.createParcel!(
          {
            parcel: testParcel,
            credentials: { apiKey: "test-key", basicUsername: "user", basicPassword: "pass" },
          },
          noHttpContext
        )
      ).rejects.toThrow();
    });
  });

  describe("Capability declarations", () => {
    it("declares supported capabilities", () => {
      expect(adapter.capabilities).toContain("CREATE_PARCEL");
      expect(adapter.capabilities).toContain("CREATE_PARCELS");
      expect(adapter.capabilities).toContain("TRACK");
      expect(adapter.capabilities).toContain("CREATE_LABEL");
    });

    it("does not declare unsupported capabilities", () => {
      expect(adapter.capabilities).not.toContain("CREATE_SHIPMENT");
      expect(adapter.capabilities).not.toContain("CLOSE_SHIPMENT");
      expect(adapter.capabilities).not.toContain("VOID_LABEL");
      expect(adapter.capabilities).not.toContain("PICKUP");
      expect(adapter.capabilities).not.toContain("RATES");
    });

    it("has empty requires (no dependencies)", () => {
      expect(adapter.requires).toEqual({});
    });

    it("declares TEST_MODE_SUPPORTED capability", () => {
      expect(adapter.capabilities).toContain("TEST_MODE_SUPPORTED");
    });
  });

  describe("Test mode (useTestApi option)", () => {
    it("uses production base URL by default for createParcel", async () => {
      const productionAdapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClient();
      const ctx: AdapterContext = { http: mockHttp, logger: console };

      await productionAdapter.createParcel!(
        {
          parcel: testParcel,
          credentials: { apiKey: "test-key", basicUsername: "user", basicPassword: "pass" },
          options: { useTestApi: false },
        },
        ctx
      );

      expect(mockHttp.lastUrl).toContain("https://webapi.foxpost.hu");
      expect(mockHttp.lastUrl).not.toContain("webapi-test");
    });

    it("uses test base URL when useTestApi=true for createParcel", async () => {
      const productionAdapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClient();
      const ctx: AdapterContext = { http: mockHttp, logger: console };

      await productionAdapter.createParcel!(
        {
          parcel: testParcel,
          credentials: { apiKey: "test-key", basicUsername: "user", basicPassword: "pass" },
          options: { useTestApi: true },
        },
        ctx
      );

      expect(mockHttp.lastUrl).toContain("https://webapi-test.foxpost.hu");
    });

    it("uses test base URL when options.useTestApi=true for track via context", async () => {
      const productionAdapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClient();
      const ctx: AdapterContext = {
        http: mockHttp,
        logger: console,
        options: { useTestApi: true },
      } as any;

      await productionAdapter.track!("CLFOX0000000001", ctx);

      expect(mockHttp.lastUrl).toContain("https://webapi-test.foxpost.hu");
    });

    it("uses production base URL for track when useTestApi is not set", async () => {
      const productionAdapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClient();
      const ctx: AdapterContext = { http: mockHttp, logger: console };

      await productionAdapter.track!("CLFOX0000000001", ctx);

      expect(mockHttp.lastUrl).toContain("https://webapi.foxpost.hu");
      expect(mockHttp.lastUrl).not.toContain("webapi-test");
    });

    it("uses test base URL when options.useTestApi=true for createLabel via context", async () => {
      const productionAdapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClient();
      const ctx: AdapterContext = {
        http: mockHttp,
        logger: console,
        options: { useTestApi: true },
      } as any;

      await productionAdapter.createLabel!("CLFOX0000000001", ctx);

      expect(mockHttp.lastUrl).toContain("https://webapi-test.foxpost.hu");
    });

    it("uses production base URL for createLabel when useTestApi is not set", async () => {
      const productionAdapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClient();
      const ctx: AdapterContext = { http: mockHttp, logger: console };

      await productionAdapter.createLabel!("CLFOX0000000001", ctx);

      expect(mockHttp.lastUrl).toContain("https://webapi.foxpost.hu");
      expect(mockHttp.lastUrl).not.toContain("webapi-test");
    });
  });

  describe("Delivery discriminator (HOME vs PICKUP_POINT)", () => {
    it("maps HOME delivery parcel correctly", async () => {
      const adapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClient();
      const homeParcel: Parcel = {
        id: "hd-001",
        shipper: {
          contact: { name: "Sender Corp", phone: "+36301111111", email: "sender@corp.com" },
          address: { name: "Sender Corp", street: "100 St", city: "Budapest", postalCode: "1011", country: "HU" },
        },
        recipient: {
          contact: { name: "John Doe", phone: "+36302222222", email: "john@example.com" },
          delivery: {
            method: "HOME" as const,
            address: {
              name: "John Doe",
              street: "456 Main St",
              city: "Debrecen",
              postalCode: "4024",
              country: "HU",
              phone: "+36302222222",
              email: "john@example.com",
            },
          },
        },
        package: { weightGrams: 500 },
        service: "standard" as const,
        references: { customerReference: "ORDER-100" },
      };

      const ctx: AdapterContext = { http: mockHttp, logger: console };
      const result = await adapter.createParcel!(
        {
          parcel: homeParcel,
          credentials: { apiKey: "test-key", basicUsername: "user", basicPassword: "pass" },
        },
        ctx
      );

      expect(result).toBeDefined();
      expect(result.carrierId).toBe("CLFOX0000000001");
      // Verify POST was called (parcel was sent to API)
      expect(mockHttp.lastMethod).toBe("POST");
      expect(mockHttp.lastUrl).toContain("/api/parcel");
    });

    it("maps PICKUP_POINT delivery parcel with APM destination", async () => {
      const adapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClient();
      const apmParcel: Parcel = {
        id: "apm-001",
        shipper: {
          contact: { name: "Sender Corp", phone: "+36301111111", email: "sender@corp.com" },
          address: { name: "Sender Corp", street: "100 St", city: "Budapest", postalCode: "1011", country: "HU" },
        },
        recipient: {
          contact: { name: "Jane Smith", phone: "+36303333333", email: "jane@example.com" },
          delivery: {
            method: "PICKUP_POINT" as const,
            pickupPoint: {
              id: "APM-BUDAPEST-001", // Foxpost locker code
              provider: "foxpost",
              name: "Foxpost Downtown Locker",
              type: "LOCKER",
            },
          },
        },
        package: { weightGrams: 300 },
        service: "express" as const,
        references: { customerReference: "ORDER-APM-200" },
      };

      const ctx: AdapterContext = { http: mockHttp, logger: console };
      const result = await adapter.createParcel!(
        {
          parcel: apmParcel,
          credentials: { apiKey: "test-key", basicUsername: "user", basicPassword: "pass" },
        },
        ctx
      );

      expect(result).toBeDefined();
      expect(result.carrierId).toBe("CLFOX0000000001");
      // Verify POST was called
      expect(mockHttp.lastMethod).toBe("POST");
      expect(mockHttp.lastUrl).toContain("/api/parcel");
    });

    it("correctly discriminates between HOME and APM in batch request", async () => {
      const adapter = new FoxpostAdapter("https://webapi.foxpost.hu");
      const mockHttp = new MockHttpClientWithTracking();
      
      const homeParcel: Parcel = {
        id: "batch-hd-001",
        shipper: {
          contact: { name: "Sender", phone: "+36301111111", email: "sender@corp.com" },
          address: { name: "Sender", street: "100 St", city: "Budapest", postalCode: "1011", country: "HU" },
        },
        recipient: {
          contact: { name: "Recipient HD", phone: "+36302222222", email: "hd@example.com" },
          delivery: {
            method: "HOME" as const,
            address: {
              name: "Recipient HD",
              street: "Street HD",
              city: "City HD",
              postalCode: "1111",
              country: "HU",
              phone: "+36302222222",
              email: "hd@example.com",
            },
          },
        },
        package: { weightGrams: 500 },
        service: "standard" as const,
      };

      const apmParcel: Parcel = {
        id: "batch-apm-001",
        shipper: {
          contact: { name: "Sender", phone: "+36301111111", email: "sender@corp.com" },
          address: { name: "Sender", street: "100 St", city: "Budapest", postalCode: "1011", country: "HU" },
        },
        recipient: {
          contact: { name: "Recipient APM", phone: "+36303333333", email: "apm@example.com" },
          delivery: {
            method: "PICKUP_POINT" as const,
            pickupPoint: { id: "LOCKER-APM-123", provider: "foxpost" },
          },
        },
        package: { weightGrams: 300 },
        service: "express" as const,
      };

      const ctx: AdapterContext = { http: mockHttp, logger: console };
      const result = await adapter.createParcels!(
        {
          parcels: [homeParcel, apmParcel],
          credentials: { apiKey: "test-key", basicUsername: "user", basicPassword: "pass" },
        },
        ctx
      );

      expect(result).toHaveLength(2);
      expect(result[0].carrierId).toBe("CLFOX0000000001");
      expect(result[1].carrierId).toBe("CLFOX0000000002");
      
      // Verify that the mock was called with correct data structure
      expect(mockHttp.lastPostData).toBeDefined();
      expect(mockHttp.lastPostData).toHaveLength(2);
      
      // HOME delivery should have street, city, zip
      const homePayload = mockHttp.lastPostData?.[0];
      expect(homePayload?.recipientAddress).toBeDefined();
      expect(homePayload?.recipientCity).toBeDefined();
      expect(homePayload?.recipientZip).toBeDefined();
      
      // APM delivery should have destination (not street/city)
      const apmPayload = mockHttp.lastPostData?.[1];
      expect(apmPayload?.destination).toBe("LOCKER-APM-123");
      expect(apmPayload?.recipientAddress).toBeUndefined();
    });
  });
});
