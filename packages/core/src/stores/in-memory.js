/**
 * InMemoryStore
 * Simple in-memory implementation of Store for testing and local development
 * Not suitable for production use
 */
export class InMemoryStore {
    shipments = new Map();
    parcels = new Map();
    labels = new Map();
    carrierResources = new Map();
    events = new Map();
    labelsByTracking = new Map();
    async saveShipment(shipment) {
        this.shipments.set(shipment.id, {
            ...shipment,
            updatedAt: new Date(),
        });
    }
    async getShipment(id) {
        return this.shipments.get(id) ?? null;
    }
    async saveParcel(parcel) {
        this.parcels.set(parcel.id, {
            ...parcel,
            updatedAt: new Date(),
        });
    }
    async getParcel(id) {
        return this.parcels.get(id) ?? null;
    }
    async saveCarrierResource(internalId, resourceType, resource) {
        const key = `${resourceType}:${internalId}`;
        this.carrierResources.set(key, resource);
    }
    async getCarrierResource(internalId, resourceType) {
        const key = `${resourceType}:${internalId}`;
        return this.carrierResources.get(key) ?? null;
    }
    async appendEvent(internalId, event) {
        if (!this.events.has(internalId)) {
            this.events.set(internalId, []);
        }
        const eventWithTimestamp = {
            ...event,
            timestamp: event.timestamp ?? new Date(),
            id: event.id ?? `${internalId}-${Date.now()}-${Math.random()}`,
        };
        this.events.get(internalId).push(eventWithTimestamp);
    }
    async getEvents(internalId) {
        return this.events.get(internalId) ?? [];
    }
    async saveLabel(label) {
        this.labels.set(label.id, label);
        this.labelsByTracking.set(label.trackingNumber, label.id);
    }
    async getLabel(id) {
        return this.labels.get(id) ?? null;
    }
    async getLabelByTrackingNumber(trackingNumber) {
        const labelId = this.labelsByTracking.get(trackingNumber);
        if (!labelId)
            return null;
        return this.labels.get(labelId) ?? null;
    }
    /**
     * Clear all data (useful for testing)
     */
    clear() {
        this.shipments.clear();
        this.parcels.clear();
        this.labels.clear();
        this.carrierResources.clear();
        this.events.clear();
        this.labelsByTracking.clear();
    }
}
//# sourceMappingURL=in-memory.js.map