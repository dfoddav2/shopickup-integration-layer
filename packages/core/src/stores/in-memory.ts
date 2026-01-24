import type { Store, DomainEvent, CarrierResource } from '../interfaces/index.js';
import type { Shipment, Parcel } from '../types/index.js';

/**
 * InMemoryStore
 * Simple in-memory implementation of Store for testing and local development
 * Not suitable for production use
 */
export class InMemoryStore implements Store {
  private shipments = new Map<string, Shipment>();
  private parcels = new Map<string, Parcel>();
  private carrierResources = new Map<string, CarrierResource>();
  private events = new Map<string, DomainEvent[]>();

  async saveShipment(shipment: Shipment): Promise<void> {
    this.shipments.set(shipment.id, {
      ...shipment,
      updatedAt: new Date(),
    });
  }

  async getShipment(id: string): Promise<Shipment | null> {
    return this.shipments.get(id) ?? null;
  }

  async saveParcel(parcel: Parcel): Promise<void> {
    this.parcels.set(parcel.id, {
      ...parcel,
      updatedAt: new Date(),
    });
  }

  async getParcel(id: string): Promise<Parcel | null> {
    return this.parcels.get(id) ?? null;
  }

  async saveCarrierResource(
    internalId: string,
    resourceType: "shipment" | "parcel" | "label",
    resource: CarrierResource
  ): Promise<void> {
    const key = `${resourceType}:${internalId}`;
    this.carrierResources.set(key, resource);
  }

  async getCarrierResource(
    internalId: string,
    resourceType: string
  ): Promise<CarrierResource | null> {
    const key = `${resourceType}:${internalId}`;
    return this.carrierResources.get(key) ?? null;
  }

  async appendEvent(internalId: string, event: DomainEvent): Promise<void> {
    if (!this.events.has(internalId)) {
      this.events.set(internalId, []);
    }

    const eventWithTimestamp: DomainEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date(),
      id: event.id ?? `${internalId}-${Date.now()}-${Math.random()}`,
    };

    this.events.get(internalId)!.push(eventWithTimestamp);
  }

  async getEvents(internalId: string): Promise<DomainEvent[]> {
    return this.events.get(internalId) ?? [];
  }

  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.shipments.clear();
    this.parcels.clear();
    this.carrierResources.clear();
    this.events.clear();
  }
}
