import type { Store, DomainEvent } from "@shopickup/core";
import type { Shipment, Parcel, Label } from "@shopickup/core";
export declare class SqliteStore implements Store {
    private db;
    constructor(path?: string);
    private ensureTables;
    saveShipment(shipment: Shipment): Promise<void>;
    getShipment(id: string): Promise<Shipment | null>;
    saveParcel(parcel: Parcel): Promise<void>;
    getParcel(id: string): Promise<Parcel | null>;
    saveCarrierResource(internalId: string, resourceType: "shipment" | "parcel" | "label", resource: any): Promise<void>;
    getCarrierResource(internalId: string, resourceType: string): Promise<any>;
    appendEvent(internalId: string, event: DomainEvent): Promise<void>;
    getEvents(internalId: string): Promise<any>;
    saveLabel(label: Label): Promise<void>;
    getLabel(id: string): Promise<Label | null>;
    getLabelByTrackingNumber(trackingNumber: string): Promise<Label | null>;
}
//# sourceMappingURL=sqlite-store.d.ts.map