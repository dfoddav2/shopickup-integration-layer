/**
 * Unit tests for Foxpost pickup points capability
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AdapterContext, HttpClient } from '@shopickup/core';
import { CarrierError } from '@shopickup/core';
import { fetchPickupPoints } from '../capabilities/pickup-points.js';

// Sample fixture data (Foxpost JSON feed format)
const SAMPLE_APM_DATA = [
  {
    place_id: 1444335,
    operator_id: "hu5844",
    name: "FOXPOST A-BOX Nyíregyháza REpont Hősök tere",
    country: "hu",
    address: "4400 Nyíregyháza, Hősök tere 15.",
    zip: "4400",
    city: "Nyíregyháza",
    street: "Hősök tere 15.",
    findme: "HU5844 számú beltéri automatánk az üzlethelyiségben található.",
    geolat: 47.956969,
    geolng: 21.716012,
    allowed2: "ALL",
    depot: "Debrecen Depo",
    load: "normal loaded",
    isOutdoor: false,
    apmType: "Rollkon",
    substitutes: [],
    cardPayment: true,
    cashPayment: false,
    open: {
      hetfo: "00:00-24:00",
      kedd: "00:00-24:00",
      szerda: "00:00-24:00",
      csutortok: "00:00-24:00",
      pentek: "00:00-24:00",
      szombat: "00:00-24:00",
      vasarnap: "00:00-24:00"
    },
    variant: "FOXPOST A-BOX",
    paymentOptions: ["card", "link"],
    service: ["pick up", "dispatch"],
  },
  {
    place_id: 1502648,
    operator_id: "hu5952",
    name: "FOXPOST A-BOX Budakalász Lipóti Pékség",
    country: "hu",
    address: "2011 Budakalász, Klisovác utca 2.",
    zip: "2011",
    city: "Budakalász",
    street: "Klisovác utca 2.",
    findme: "HU5952 számú kültéri automatánk az üzlet udvarában található.",
    geolat: 47.621138,
    geolng: 19.045587,
    allowed2: "ALL",
    depot: "Maglód Depo",
    load: "normal loaded",
    isOutdoor: true,
    apmType: "Rollkon",
    substitutes: [],
    cardPayment: true,
    cashPayment: false,
    open: {
      hetfo: "06:00-20:00",
      kedd: "06:00-20:00",
      szerda: "06:00-20:00",
      csutortok: "06:00-20:00",
      pentek: "06:00-20:00",
      szombat: "07:00-13:00",
      vasarnap: "-"
    },
    variant: "FOXPOST A-BOX",
    paymentOptions: ["card", "link"],
    service: ["pick up", "dispatch"],
  },
  {
    place_id: 1449553,
    // operator_id is empty - should fall back to place_id
    operator_id: "",
    name: "FOXPOST A-BOX Bp. 03. ker. No operator_id",
    country: "hu",
    address: "1032 Budapest, III, 03 Váradi utca 26.",
    zip: "1032",
    city: "Budapest",
    street: "III, 03 Váradi utca 26.",
    geolat: 47.543684,
    geolng: 19.033297,
    allowed2: "C2C",
    isOutdoor: true,
    cardPayment: true,
    cashPayment: true,
    paymentOptions: ["card", "cash"],
  },
];

describe("Foxpost Pickup Points", () => {
  let mockHttpClient: HttpClient;
  let mockContext: AdapterContext;

  beforeEach(() => {
    // Create mock HTTP client
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    // Create mock adapter context
    mockContext = {
      http: mockHttpClient,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
  });

  describe("fetchPickupPoints", () => {
    it("should fetch and normalize Foxpost APM data", async () => {
      // Mock HTTP response with normalized HttpResponse structure
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);

      expect(result.points).toBeDefined();
      expect(result.points.length).toBe(3);
      expect(result.summary).toBeDefined();
      expect(result.summary?.totalCount).toBe(3);
      expect(result.rawCarrierResponse).toEqual(SAMPLE_APM_DATA);
    });

    it("should use operator_id as primary id when present", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      expect(firstPoint.id).toBe("hu5844");
      expect(firstPoint.providerId).toBe("1444335");
    });

    it("should fall back to place_id when operator_id is empty", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const thirdPoint = result.points[2];

      // Should use place_id (1449553) as id when operator_id is empty
      expect(thirdPoint.id).toBe("1449553");
    });

    it("should normalize address fields", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      expect(firstPoint.postalCode).toBe("4400");
      expect(firstPoint.city).toBe("Nyíregyháza");
      expect(firstPoint.street).toBe("Hősök tere 15.");
      expect(firstPoint.address).toBe("4400 Nyíregyháza, Hősök tere 15.");
    });

    it("should parse coordinates correctly", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      expect(firstPoint.latitude).toBe(47.956969);
      expect(firstPoint.longitude).toBe(21.716012);
    });

    it("should map allowed2 'ALL' to both pickup and dropoff", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      expect(firstPoint.pickupAllowed).toBe(true);
      expect(firstPoint.dropoffAllowed).toBe(true);
    });

    it("should map allowed2 'C2C' to dropoff only", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const thirdPoint = result.points[2];

      expect(thirdPoint.pickupAllowed).toBe(false);
      expect(thirdPoint.dropoffAllowed).toBe(true);
    });

    it("should collect payment options from multiple sources", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      // First point: cardPayment=true, paymentOptions=["card", "link"]
      expect(firstPoint.paymentOptions).toContain("card");
      expect(firstPoint.paymentOptions).toContain("link");
    });

    it("should collect both card and cash payment options", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const thirdPoint = result.points[2];

      expect(thirdPoint.paymentOptions).toContain("card");
      expect(thirdPoint.paymentOptions).toContain("cash");
    });

    it("should include opening hours", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      expect(firstPoint.openingHours).toBeDefined();
      expect((firstPoint.openingHours as any).hetfo).toBe("00:00-24:00");
    });

    it("should preserve isOutdoor flag", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);

      expect(result.points[0].isOutdoor).toBe(false);
      expect(result.points[1].isOutdoor).toBe(true);
    });

    it("should collect carrier-specific metadata", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      expect(firstPoint.metadata).toBeDefined();
      expect(firstPoint.metadata?.depot).toBe("Debrecen Depo");
      expect(firstPoint.metadata?.apmType).toBe("Rollkon");
      expect(firstPoint.metadata?.variant).toBe("FOXPOST A-BOX");
    });

    it("should include full raw entry", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      expect(firstPoint.raw).toEqual(SAMPLE_APM_DATA[0]);
    });

    it("should normalize country code to lowercase", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const firstPoint = result.points[0];

      expect(firstPoint.country).toBe("hu");
    });

    it("should handle missing HTTP client", async () => {
      const contextWithoutHttp: AdapterContext = {
        logger: mockContext.logger,
      };

      await expect(fetchPickupPoints({}, contextWithoutHttp)).rejects.toThrow(
        "HTTP client not provided in adapter context"
      );
    });

    it("should handle invalid response (not array)", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: { data: "not an array" },
      });

      await expect(fetchPickupPoints({}, mockContext)).rejects.toThrow(CarrierError);
    });

    it("should handle network errors", async () => {
      (mockHttpClient.get as any).mockRejectedValueOnce(new Error("Network error"));

      await expect(fetchPickupPoints({}, mockContext)).rejects.toThrow(CarrierError);
    });

    it("should handle coordinates as strings", async () => {
      const dataWithStringCoords = [
        {
          place_id: 123,
          operator_id: "test",
          name: "Test APM",
          geolat: "47.5",
          geolng: "19.0",
        },
      ];

      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: dataWithStringCoords,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const point = result.points[0];

      expect(point.latitude).toBe(47.5);
      expect(point.longitude).toBe(19.0);
    });

    it("should handle invalid coordinate values", async () => {
      const dataWithInvalidCoords = [
        {
          place_id: 123,
          operator_id: "test",
          name: "Test APM",
          geolat: "invalid",
          geolng: null,
        },
      ];

      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: dataWithInvalidCoords,
      });

      const result = await fetchPickupPoints({}, mockContext);
      const point = result.points[0];

      expect(point.latitude).toBeUndefined();
      expect(point.longitude).toBeUndefined();
    });

    it("should call HTTP client with correct URL", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: [],
      });

      await fetchPickupPoints({}, mockContext);

      expect(mockHttpClient.get).toHaveBeenCalledWith("https://cdn.foxpost.hu/foxplus.json");
    });

    it("should log debug info", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: SAMPLE_APM_DATA,
      });

      // Disable silent mode to verify logging works
      await fetchPickupPoints({}, { ...mockContext, loggingOptions: { silentOperations: [] } });

      expect(mockContext.logger?.debug).toHaveBeenCalled();
    });

    it("should handle empty response array", async () => {
      (mockHttpClient.get as any).mockResolvedValueOnce({
        status: 200,
        headers: {},
        body: [],
      });

      const result = await fetchPickupPoints({}, mockContext);

      expect(result.points).toEqual([]);
      expect(result.summary?.totalCount).toBe(0);
    });
  });
});
