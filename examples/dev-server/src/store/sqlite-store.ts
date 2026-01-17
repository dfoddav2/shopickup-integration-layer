// Use an untyped import for better-sqlite3 in the example
// This avoids needing @types/better-sqlite3 for the dev server.
// Use untyped import for better-sqlite3; we'll treat it as any at runtime
import Database from "better-sqlite3";

import type { Store, DomainEvent } from "../../../packages/core/src/interfaces";
import type { Shipment, Parcel, Label } from "../../../packages/core/src/types";

export class SqliteStore implements Store {
  private db: Database;

  constructor(path = ":memory:") {
    this.db = new Database(path);
    this.ensureTables();
  }

  private ensureTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shipments (
        id TEXT PRIMARY KEY,
        carrierIds TEXT,
        sender TEXT,
        recipient TEXT,
        service TEXT,
        reference TEXT,
        dimensions TEXT,
        totalWeight INTEGER,
        metadata TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS parcels (
        id TEXT PRIMARY KEY,
        shipmentId TEXT,
        weight INTEGER,
        dimensions TEXT,
        metadata TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS carrier_resources (
        id TEXT PRIMARY KEY,
        internalId TEXT,
        resourceType TEXT,
        carrierId TEXT,
        status TEXT,
        raw TEXT,
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
        resource TEXT
      );
    `);
  }

  async saveShipment(shipment: Shipment): Promise<void> {
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO shipments (
      id, carrierIds, sender, recipient, service, reference, dimensions, totalWeight, metadata, createdAt, updatedAt
    ) VALUES (@id, @carrierIds, @sender, @recipient, @service, @reference, @dimensions, @totalWeight, @metadata, @createdAt, @updatedAt)`);

    stmt.run({
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
    });
  }

  async getShipment(id: string): Promise<Shipment | null> {
    const row = this.db.prepare(`SELECT * FROM shipments WHERE id = ?`).get(id);
    if (!row) return null;
    return {
      id: row.id,
      carrierIds: row.carrierIds ? JSON.parse(row.carrierIds) : undefined,
      sender: row.sender ? JSON.parse(row.sender) : undefined,
      recipient: row.recipient ? JSON.parse(row.recipient) : undefined,
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
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO parcels (
      id, shipmentId, weight, dimensions, metadata, createdAt, updatedAt
    ) VALUES (@id, @shipmentId, @weight, @dimensions, @metadata, @createdAt, @updatedAt)`);

    stmt.run({
      id: parcel.id,
      shipmentId: (parcel as any).shipmentId || null,
      weight: parcel.weight,
      dimensions: JSON.stringify(parcel.dimensions || null),
      metadata: JSON.stringify(parcel.metadata || null),
      createdAt: (parcel as any).createdAt || new Date().toISOString(),
      updatedAt: (parcel as any).updatedAt || new Date().toISOString(),
    });
  }

  async getParcel(id: string): Promise<Parcel | null> {
    const row = this.db.prepare(`SELECT * FROM parcels WHERE id = ?`).get(id);
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
    const stmt = this.db.prepare(`INSERT INTO carrier_resources (id, internalId, resourceType, carrierId, status, raw, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(id, internalId, resourceType, resource.carrierId || "", resource.status || "", JSON.stringify(resource.raw || null), new Date().toISOString());
  }

  async getCarrierResource(internalId: string, resourceType: string) {
    const row = this.db.prepare(`SELECT * FROM carrier_resources WHERE internalId = ? AND resourceType = ? LIMIT 1`).get(internalId, resourceType);
    if (!row) return null;
    return {
      carrierId: row.carrierId,
      status: row.status,
      raw: row.raw ? JSON.parse(row.raw) : undefined,
    } as any;
  }

  async appendEvent(internalId: string, event: DomainEvent): Promise<void> {
    const id = event.id || `${internalId}-evt-${Date.now()}`;
    const stmt = this.db.prepare(`INSERT INTO events (id, internalId, type, timestamp, carrierId, resource) VALUES (?, ?, ?, ?, ?, ?)`);
    stmt.run(id, internalId, event.type, (event.timestamp || new Date()).toISOString(), event.carrierId || "", JSON.stringify(event.resource || null));
  }

  async getEvents(internalId: string) {
    const rows = this.db.prepare(`SELECT * FROM events WHERE internalId = ?`).all(internalId);
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
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO labels (id, parcelId, carrierId, labelData, createdAt) VALUES (?, ?, ?, ?, ?)`);
    stmt.run(id, label.parcelId || "", label.carrier || label.trackingNumber || "", (label as any).labelData || "", new Date().toISOString());
  }

  async getLabel(id: string) {
    const row = this.db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id);
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
    const row = this.db.prepare(`SELECT * FROM labels WHERE carrierId = ? LIMIT 1`).get(trackingNumber);
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
