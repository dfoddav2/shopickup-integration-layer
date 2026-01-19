/**
 * Integration tests for Foxpost adapter
 * Tests full flow: create parcel -> create label -> track
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { AdapterContext, Shipment, Parcel, HttpClient, CreateParcelRequest } from "@shopickup/core";
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

describe("FoxpostAdapter Integration", () => {
  let adapter: FoxpostAdapter;
  let mockHttp: MockHttpClient;
  let context: AdapterContext;

  const testShipment: Shipment = {
    id: "s1",
    sender: {
      name: "Acme Corp",
      street: "123 Business Ave",
      city: "Budapest",
      postalCode: "1011",
      country: "HU",
      phone: "+36301111111",
      email: "shipping@acme.com",
    },
    recipient: {
      name: "John Doe",
      street: "456 Main St",
      city: "Debrecen",
      postalCode: "4024",
      country: "HU",
      phone: "+36302222222",
      email: "john@example.com",
    },
    service: "standard",
    totalWeight: 1000,
    reference: "ORD-12345",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testParcel: Parcel = {
    id: "p1",
    shipmentId: "s1",
    weight: 1000,
    dimensions: { length: 20, width: 20, height: 20 },
    status: "draft",
  };

  beforeAll(() => {
    adapter = new FoxpostAdapter("https://webapi-test.foxpost.hu");
    mockHttp = new MockHttpClient();
    context = {
      http: mockHttp,
      logger: console,
    };
  });

  describe("Basic operations", () => {
    it("creates a label for the parcel", async () => {
      const barcode = "CLFOX0000000001";

      const result = await adapter.createLabel!(barcode, context);

      expect(result.carrierId).toBe(barcode);
      expect(result.status).toBe("created");
      expect(result.labelUrl).toBeDefined();
    });

    it("tracks the parcel", async () => {
      const barcode = "CLFOX0000000001";

      const result = await adapter.track!(barcode, context);

      expect(result.trackingNumber).toBe(barcode);
      expect(result.events).toHaveLength(3);
      expect(result.status).toBe("DELIVERED");
      expect(result.events[0].status).toBe("PENDING");
      expect(result.events[1].status).toBe("IN_TRANSIT");
      expect(result.events[2].status).toBe("DELIVERED");
    });
  });

  describe("Error handling", () => {
    it("throws error when HTTP client is not provided", async () => {
      const invalidContext: AdapterContext = {
        logger: console,
        // http is missing
      };

      await expect(
        adapter.createParcel!(
          "s1",
          {
            shipment: testShipment,
            parcel: testParcel,
            credentials: { apiKey: "test-key" },
          },
          invalidContext
        )
      ).rejects.toThrow("HTTP client not provided");
    });

    it("throws NotImplementedError for unsupported capabilities", async () => {
      await expect(
        adapter.createShipment!(
          { shipment: testShipment, credentials: { apiKey: "test-key" } },
          context
        )
      ).rejects.toThrow(/is not implemented by adapter/);
    });
  });

  describe("Capability declarations", () => {
    it("declares supported capabilities", () => {
      expect(adapter.capabilities).toContain("CREATE_PARCEL");
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
        "s1",
        {
          shipment: testShipment,
          parcel: testParcel,
          credentials: { apiKey: "test-key" },
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
        "s1",
        {
          shipment: testShipment,
          parcel: testParcel,
          credentials: { apiKey: "test-key" },
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
      } as any; // Allow options in context for test mode

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
      } as any; // Allow options in context for test mode

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
