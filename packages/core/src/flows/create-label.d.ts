import type { CarrierAdapter, AdapterContext, CarrierResource, Store } from "../interfaces";
import type { Shipment, Parcel } from "../types";
/**
 * Result of executeCreateLabelFlow
 */
export interface CreateLabelFlowResult {
    /** Resource created for the shipment */
    shipmentResource: CarrierResource | null;
    /** Resources created for each parcel */
    parcelResources: CarrierResource[];
    /** Resources created for each label */
    labelResources: CarrierResource[];
    /** Any errors that occurred during the flow */
    errors: Array<{
        step: string;
        error: unknown;
    }>;
}
/**
 * Orchestration helper: Execute the create label flow
 *
 * This helper composes adapter methods into a workflow for creating labels.
 * It handles carrier-specific dependencies (e.g., must close before label).
 *
 * Steps:
 * 1. Create shipment (if supported)
 * 2. Create parcels (if supported)
 * 3. Close shipment (if required before label)
 * 4. Create labels
 *
 * @param opts Options for the flow
 * @returns Result with created resources
 */
export declare function executeCreateLabelFlow(opts: {
    adapter: CarrierAdapter;
    shipment: Shipment;
    parcels: Parcel[];
    credentials: Record<string, unknown>;
    context: AdapterContext;
    store?: Store;
}): Promise<CreateLabelFlowResult>;
//# sourceMappingURL=create-label.d.ts.map