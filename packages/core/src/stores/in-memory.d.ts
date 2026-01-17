import type { Store, DomainEvent, CarrierResource } from "../interfaces";
import type { Shipment } from "../types/shipment";
import type { Parcel } from "../types/parcel";
import type { Label } from "../types/label";
/**
 * InMemoryStore
 * Simple in-memory implementation of Store for testing and local development
 * Not suitable for production use
 */
export declare class InMemoryStore implements Store {
    private shipments;
    private parcels;
    private labels;
    private carrierResources;
    private events;
    private labelsByTracking;
    saveShipment(shipment: Shipment): Promise<void>;
    getShipment(id: string): Promise<Shipment | null>;
    saveParcel(parcel: Parcel): Promise<void>;
    getParcel(id: string): Promise<Parcel | null>;
    saveCarrierResource(internalId: string, resourceType: "shipment" | "parcel" | "label", resource: CarrierResource): Promise<void>;
    getCarrierResource(internalId: string, resourceType: string): Promise<CarrierResource | null>;
    appendEvent(internalId: string, event: DomainEvent): Promise<void>;
    getEvents(internalId: string): Promise<DomainEvent[]>;
    saveLabel(label: Label): Promise<void>;
    getLabel(id: string): Promise<Label | null>;
    getLabelByTrackingNumber(trackingNumber: string): Promise<Label | null>;
    /**
     * Clear all data (useful for testing)
     */
    clear(): void;
}
//# sourceMappingURL=in-memory.d.ts.map