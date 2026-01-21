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
      return {
        valid: true,
        parcels: [
          {
            barcode: "CLFOX0000000001",
            refCode: data?.[0]?.refCode,
            errors: [],
          },
        ],
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

// Helper: create a test parcel with all required fields
function createTestParcel(id: string = 'p1'): Parcel {
  return {
    id,
    sender: {
      name: "Acme Corp",
      street: "123 Business Ave",
      city: "Budapest",
      postalCode: "1011",
      country: "HU",
      phone: "+36301111111",
      email: "sender@acme.com",
    },
    recipient: {
      name: "John Smith",
      street: "456 Customer St",
      city: "Debrecen",
      postalCode: "4024",
      country: "HU",
      phone: "+36302222222",
      email: "john@example.com",
    },
    weight: 1500,
    service: "standard",
    reference: "ORD-12345",
    dimensions: { length: 30, width: 20, height: 15 },
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
          credentials: { apiKey: "test-key", username: "user", password: "pass" },
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
            credentials: { apiKey: "test-key", username: "user", password: "pass" },
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
          credentials: { apiKey: "test-key", username: "user", password: "pass" },
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
          credentials: { apiKey: "test-key", username: "user", password: "pass" },
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
});
