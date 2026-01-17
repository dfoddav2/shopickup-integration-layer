import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Store, DomainEvent } from "@shopickup/core";
import type { Shipment, Parcel, Label } from "@shopickup/core";
import { shipments, parcels, carrierResources, labels, events } from "./schema";

export class SqliteStore implements Store {
  private db: Database.Database;
  private client: ReturnType<typeof drizzle>;

  constructor(path = ":memory:") {
    this.db = new Database(path);
    this.client = drizzle(this.db);
    this.ensureTables();
  }

  private ensureTables() {
    // In production, use migrations. For dev server create tables if not exist
    // We'll use simple CREATE TABLE IF NOT EXISTS via raw SQL for speed
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shipments (
        id TEXT PRIMARY KEY,
        carrierIds JSON,
        sender JSON,
        recipient JSON,
        service TEXT,
        reference TEXT,
        dimensions JSON,
        totalWeight INTEGER,
        metadata JSON,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS parcels (
        id TEXT PRIMARY KEY,
        shipmentId TEXT,
        weight INTEGER,
        dimensions JSON,
        metadata JSON,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS carrier_resources (
        id TEXT PRIMARY KEY,
        internalId TEXT,
        resourceType TEXT,
        carrierId TEXT,
        status TEXT,
        raw JSON,
        createdAt TEXT
      );

      CREATE TABLE IF NOT EXISTS labels (
        id TEXT PRIMARY KEY,
        parcelId TEXT,
        carrierId TEXT,
        labelData TEXT,
        createdAt TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        internalId TEXT,
        type TEXT,
        timestamp TEXT,
        carrierId TEXT,
        resource JSON
      );
    `);
  }

  async saveShipment(shipment: Shipment): Promise<void> {
    const now = new Date().toISOString();
    this.client.insert(shipments).values({
      id: shipment.id,
      carrierIds: JSON.stringify(shipment.carrierIds || null),
      sender: JSON.stringify(shipment.sender),
      recipient: JSON.stringify(shipment.recipient),
      service: shipment.service,
      reference: shipment.reference || "",
      dimensions: JSON.stringify(shipment.dimensions || null),
      totalWeight: shipment.totalWeight,
      metadata: JSON.stringify(shipment.metadata || null),
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    }).run();
  }

  async getShipment(id: string): Promise<Shipment | null> {
    const row = this.client.select().from(shipments).where(shipments.id.eq(id)).get();
    if (!row) return null;

    return {
      id: row.id,
      carrierIds: row.carrierIds ? JSON.parse(row.carrierIds) : undefined,
      sender: JSON.parse(row.sender),
      recipient: JSON.parse(row.recipient),
      service: row.service,
      reference: row.reference || undefined,
      dimensions: row.dimensions ? JSON.parse(row.dimensions) : undefined,
      totalWeight: row.totalWeight,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    } as Shipment;
  }

  async saveParcel(parcel: Parcel): Promise<void> {
    this.client.insert(parcels).values({
      id: parcel.id,
      shipmentId: (parcel as any).shipmentId || null,
      weight: parcel.weight,
      dimensions: JSON.stringify(parcel.dimensions || null),
      metadata: JSON.stringify(parcel.metadata || null),
      createdAt: (parcel as any).createdAt || new Date().toISOString(),
      updatedAt: (parcel as any).updatedAt || new Date().toISOString(),
    }).run();
  }

  async getParcel(id: string): Promise<Parcel | null> {
    const row = this.client.select().from(parcels).where(parcels.id.eq(id)).get();
    if (!row) return null;
    return {
      id: row.id,
      weight: row.weight,
      dimensions: row.dimensions ? JSON.parse(row.dimensions) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    } as Parcel;
  }

  async saveCarrierResource(internalId: string, resourceType: "shipment" | "parcel" | "label", resource: any): Promise<void> {
    const id = `${internalId}-${resourceType}-${Date.now()}`;
    this.client.insert(carrierResources).values({
      id,
      internalId,
      resourceType,
      carrierId: resource.carrierId || "",
      status: resource.status || "",
      raw: JSON.stringify(resource.raw || null),
      createdAt: new Date().toISOString(),
    }).run();
  }

  async getCarrierResource(internalId: string, resourceType: string) {
    const row = this.client.select().from(carrierResources).where(carrierResources.internalId.eq(internalId).and(carrierResources.resourceType.eq(resourceType))).get();
    if (!row) return null;
    return {
      carrierId: row.carrierId,
      status: row.status,
      raw: row.raw ? JSON.parse(row.raw) : undefined,
    } as any;
  }

  async appendEvent(internalId: string, event: DomainEvent): Promise<void> {
    const id = event.id || `${internalId}-evt-${Date.now()}`;
    this.client.insert(events).values({
      id,
      internalId,
      type: event.type,
      timestamp: (event.timestamp || new Date()).toISOString(),
      carrierId: event.carrierId || "",
      resource: JSON.stringify(event.resource || null),
    }).run();
  }

  async getEvents(internalId: string) {
    const rows = this.client.select().from(events).where(events.internalId.eq(internalId)).all();
    return rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      timestamp: new Date(r.timestamp),
      internalId: r.internalId,
      carrierId: r.carrierId || undefined,
      resource: r.resource ? JSON.parse(r.resource) : undefined,
    }));
  }

  async saveLabel(label: Label): Promise<void> {
    const id = label.id || `${label.trackingNumber}-label`;
    this.client.insert(labels).values({
      id,
      parcelId: label.parcelId || "",
      carrierId: label.trackingNumber || "",
      labelData: label.data || "",
      createdAt: new Date().toISOString(),
    }).run();
  }

  async getLabel(id: string) {
    const row = this.client.select().from(labels).where(labels.id.eq(id)).get();
    if (!row) return null;
    return {
      id: row.id,
      parcelId: row.parcelId,
      trackingNumber: row.carrierId,
      data: row.labelData,
      createdAt: new Date(row.createdAt),
    } as Label;
  }

  async getLabelByTrackingNumber(trackingNumber: string) {
    const row = this.client.select().from(labels).where(labels.carrierId.eq(trackingNumber)).get();
    if (!row) return null;
    return {
      id: row.id,
      parcelId: row.parcelId,
      trackingNumber: row.carrierId,
      data: row.labelData,
      createdAt: new Date(row.createdAt),
    } as Label;
  }
}
