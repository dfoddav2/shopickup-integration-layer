/**
 * Unit tests for Foxpost mapper functions
 * Tests bidirectional mapping between canonical types and Foxpost API types
 */

import { describe, it, expect } from "@jest/globals";
import type { Shipment, Parcel, Address } from "@shopickup/core";
import {
  mapAddressToFoxpost,
  determineFoxpostSize,
  mapParcelToFoxpost,
  mapFoxpostStatusToCanonical,
  mapFoxpostTrackToCanonical,
} from '../mappers/index.js';
import type { TrackDTO } from '../types/generated.js';

describe("Mapper: mapAddressToFoxpost", () => {
  it("maps canonical address to Foxpost format", () => {
    const canonical: Address = {
      name: "John Doe",
      street: "123 Main Street",
      city: "Budapest",
      postalCode: "1011",
      country: "HU",
      phone: "+36301234567",
      email: "john@example.com",
    };

    const foxpost = mapAddressToFoxpost(canonical);

    expect(foxpost.name).toBe("John Doe");
    expect(foxpost.address).toBe("123 Main Street");
    expect(foxpost.city).toBe("Budapest");
    expect(foxpost.zip).toBe("1011");
    expect(foxpost.country).toBe("HU");
    expect(foxpost.phone).toBe("+36301234567");
    expect(foxpost.email).toBe("john@example.com");
  });

  it("truncates name to max 150 characters", () => {
    const longName = "A".repeat(200);
    const canonical: Address = {
      name: longName,
      street: "Street",
      city: "City",
      postalCode: "1000",
      country: "HU",
    };

    const foxpost = mapAddressToFoxpost(canonical);

    expect(foxpost.name.length).toBeLessThanOrEqual(150);
  });

  it("defaults country to HU if not provided", () => {
    const canonical: Address = {
      name: "John",
      street: "Street",
      city: "City",
      postalCode: "1000",
      country: "SK", // Different country
    };

    const foxpost = mapAddressToFoxpost(canonical);

    expect(foxpost.country).toBe("SK");
  });

  it("handles missing optional fields", () => {
    const canonical: Address = {
      name: "John",
      street: "Street",
      city: "City",
      postalCode: "1000",
      country: "HU",
      // phone and email are optional
    };

    const foxpost = mapAddressToFoxpost(canonical);

    expect(foxpost.phone).toBe("");
    expect(foxpost.email).toBe("");
  });
});

describe("Mapper: determineFoxpostSize", () => {
  it("returns xs for very small parcels", () => {
    const parcel: Parcel = {
      id: "p1",
      weight: 100, // 100g
      dimensions: { length: 10, width: 10, height: 10 }, // 1000 cm³
    };

    const size = determineFoxpostSize(parcel);

    expect(size).toBe("xs");
  });

  it("returns s for small parcels", () => {
    const parcel: Parcel = {
      id: "p1",
      weight: 500,
      dimensions: { length: 20, width: 20, height: 20 }, // 8000 cm³
    };

    const size = determineFoxpostSize(parcel);

    expect(size).toBe("s");
  });

  it("returns m for medium parcels", () => {
    const parcel: Parcel = {
      id: "p1",
      weight: 1000,
      dimensions: { length: 40, width: 30, height: 20 }, // 24000 cm³
    };

    const size = determineFoxpostSize(parcel);

    expect(size).toBe("m");
  });

  it("returns l for large parcels", () => {
    const parcel: Parcel = {
      id: "p1",
      weight: 5000,
      dimensions: { length: 60, width: 50, height: 40 }, // 120000 cm³
    };

    const size = determineFoxpostSize(parcel);

    expect(size).toBe("l");
  });

  it("defaults to s when no dimensions provided", () => {
    const parcel: Parcel = {
      id: "p1",
      weight: 1000,
      // no dimensions
    };

    const size = determineFoxpostSize(parcel);

    expect(size).toBe("s");
  });
});

describe("Mapper: mapParcelToFoxpost", () => {
  it("maps canonical parcel and shipment to Foxpost request", () => {
    const shipment: Shipment = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
      reference: "ORD-12345",
    };

    const parcel: Parcel = {
      id: "p1",
      weight: 1000,
      dimensions: { length: 20, width: 20, height: 20 },
    };

    const foxpost = mapParcelToFoxpost(parcel, shipment);

    expect(foxpost.recipientName).toBe("John Doe");
    expect(foxpost.recipientPhone).toBe("+36302222222");
    expect(foxpost.recipientEmail).toBe("john@example.com");
    expect(foxpost.recipientCity).toBe("Debrecen");
    expect(foxpost.recipientZip).toBe("4024");
    expect(foxpost.recipientAddress).toBe("456 Main St");
    expect(foxpost.recipientCountry).toBe("HU");
    expect(foxpost.size).toBe("s");
    expect(foxpost.refCode).toContain("ORD-12345");
  });

  it("includes metadata like fragile and comment", () => {
    const shipment: Shipment = {
      id: "s1",
      sender: {
        name: "Acme",
        street: "St",
        city: "City",
        postalCode: "1000",
        country: "HU",
      },
      recipient: {
        name: "John",
        street: "St",
        city: "City",
        postalCode: "1000",
        country: "HU",
      },
      service: "standard",
      totalWeight: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const parcel: Parcel = {
      id: "p1",
      weight: 1000,
      metadata: {
        fragile: true,
        comment: "Handle with care",
      },
    };

    const foxpost = mapParcelToFoxpost(parcel, shipment);

    expect(foxpost.fragile).toBe(true);
    expect(foxpost.comment).toBe("Handle with care");
  });
});

describe("Mapper: mapFoxpostStatusToCanonical", () => {
  it("maps RECEIVE to DELIVERED", () => {
    const status = mapFoxpostStatusToCanonical("RECEIVE");
    expect(status).toBe("DELIVERED");
  });

  it("maps HDSENT to OUT_FOR_DELIVERY", () => {
    const status = mapFoxpostStatusToCanonical("HDSENT");
    expect(status).toBe("OUT_FOR_DELIVERY");
  });

  it("maps OPEROUT to IN_TRANSIT", () => {
    const status = mapFoxpostStatusToCanonical("OPEROUT");
    expect(status).toBe("IN_TRANSIT");
  });

  it("maps RETURNED to RETURNED", () => {
    const status = mapFoxpostStatusToCanonical("RETURNED");
    expect(status).toBe("RETURNED");
  });

  it("maps OVERTIMEOUT to EXCEPTION", () => {
    const status = mapFoxpostStatusToCanonical("OVERTIMEOUT");
    expect(status).toBe("EXCEPTION");
  });

  it("defaults to PENDING for unknown status", () => {
    const status = mapFoxpostStatusToCanonical("UNKNOWN_STATUS");
    expect(status).toBe("PENDING");
  });
});

describe("Mapper: mapFoxpostTrackToCanonical", () => {
  it("maps Foxpost track to canonical TrackingEvent", () => {
    const foxpostTrack: TrackDTO = {
      trackId: 1,
      status: "RECEIVE",
      statusDate: "2024-01-17T10:00:00Z",
      longName: "Parcel received at facility",
    };

    const event = mapFoxpostTrackToCanonical(foxpostTrack);

    expect(event.status).toBe("DELIVERED");
    expect(event.description).toBe("Parcel received at facility");
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.raw).toEqual(foxpostTrack);
  });

  it("handles missing optional fields", () => {
    const foxpostTrack: TrackDTO = {
      trackId: 1,
      status: "CREATE",
    };

    const event = mapFoxpostTrackToCanonical(foxpostTrack);

    expect(event.status).toBe("PENDING");
    expect(event.description).toBe("CREATE");
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it("uses longName for description when available", () => {
    const foxpostTrack: TrackDTO = {
      trackId: 1,
      status: "HDSENT",
      longName: "Out for delivery",
    };

    const event = mapFoxpostTrackToCanonical(foxpostTrack);

    expect(event.description).toBe("Out for delivery");
  });

  it("falls back to status code for description if longName missing", () => {
    const foxpostTrack: TrackDTO = {
      trackId: 1,
      status: "HDSENT",
      // longName not provided
    };

    const event = mapFoxpostTrackToCanonical(foxpostTrack);

    expect(event.description).toBe("HDSENT");
  });
});
