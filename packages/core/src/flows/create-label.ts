import type {
  CarrierAdapter,
  AdapterContext,
  CarrierResource,
  Store,
  DomainEvent,
} from '../interfaces/index.js';
import type { Shipment, Parcel } from '../types/index.js';
import { Capabilities } from '../interfaces/capabilities.js';

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
  errors: Array<{ step: string; error: unknown }>;
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
export async function executeCreateLabelFlow(opts: {
  adapter: CarrierAdapter;
  shipment: Shipment;
  parcels: Parcel[];
  credentials: Record<string, unknown>;
  context: AdapterContext;
  store?: Store;
}): Promise<CreateLabelFlowResult> {
  const { adapter, shipment, parcels, credentials, context, store } = opts;

  const result: CreateLabelFlowResult = {
    shipmentResource: null,
    parcelResources: [],
    labelResources: [],
    errors: [],
  };

  try {
    // Step 1: Create shipment (if supported)
    if (adapter.capabilities.includes(Capabilities.CREATE_SHIPMENT)) {
      context.logger?.debug("Flow: Creating shipment", { shipmentId: shipment.id });

      const shipmentRes = await adapter.createShipment!(
        { shipment, credentials },
        context
      );

      result.shipmentResource = shipmentRes;

      if (store && shipmentRes.carrierId) {
        await store.saveCarrierResource(shipment.id, "shipment", shipmentRes);
        await store.appendEvent(shipment.id, {
          type: "SHIPMENT_CREATED",
          internalId: shipment.id,
          carrierId: adapter.id,
          resource: shipmentRes,
        });
      }

      context.logger?.info("Flow: Shipment created", {
        carrierId: shipmentRes.carrierId,
      });
    }

    // Step 2: Create parcels (if supported)
    if (adapter.capabilities.includes(Capabilities.CREATE_PARCEL)) {
      const shipmentCarrierId =
        result.shipmentResource?.carrierId || shipment.id;

      for (const parcel of parcels) {
        context.logger?.debug("Flow: Creating parcel", {
          parcelId: parcel.id,
          weight: parcel.weight,
        });

         const parcelRes = await adapter.createParcel!(
           shipmentCarrierId,
           { shipment, parcel, credentials },
           context
         );

        result.parcelResources.push(parcelRes);

        if (store && parcelRes.carrierId) {
          await store.saveCarrierResource(parcel.id, "parcel", parcelRes);
          await store.appendEvent(parcel.id, {
            type: "PARCEL_CREATED",
            internalId: parcel.id,
            carrierId: adapter.id,
            resource: parcelRes,
          });
        }

        context.logger?.info("Flow: Parcel created", {
          carrierId: parcelRes.carrierId,
        });
      }
    }

    // Step 3: Close shipment (if required before label)
    if (
      adapter.requires?.createLabel?.includes(Capabilities.CLOSE_SHIPMENT) &&
      adapter.capabilities.includes(Capabilities.CLOSE_SHIPMENT)
    ) {
      const shipmentCarrierId =
        result.shipmentResource?.carrierId || shipment.id;

      context.logger?.debug("Flow: Closing shipment", {
        shipmentId: shipmentCarrierId,
      });

      const closeRes = await adapter.closeShipment!(
        shipmentCarrierId,
        context
      );

      if (store) {
        await store.appendEvent(shipment.id, {
          type: "SHIPMENT_CLOSED",
          internalId: shipment.id,
          carrierId: adapter.id,
          resource: closeRes,
        });
      }

      context.logger?.info("Flow: Shipment closed", {
        shipmentId: shipmentCarrierId,
      });
    }

    // Step 4: Create labels (for each parcel if supported)
    if (adapter.capabilities.includes(Capabilities.CREATE_LABEL)) {
      for (let i = 0; i < result.parcelResources.length; i++) {
        const parcelRes = result.parcelResources[i];
        const parcel = parcels[i];

        if (!parcelRes.carrierId) {
          context.logger?.warn("Flow: Skipping label creation, no parcel ID", {
            parcelId: parcel.id,
          });
          continue;
        }

        context.logger?.debug("Flow: Creating label", {
          parcelId: parcelRes.carrierId,
        });

        const labelRes = await adapter.createLabel!(
          parcelRes.carrierId,
          context
        );

        result.labelResources.push(labelRes);

        if (store && labelRes.carrierId) {
          await store.saveCarrierResource(parcel.id, "label", labelRes);
          await store.appendEvent(parcel.id, {
            type: "LABEL_GENERATED",
            internalId: parcel.id,
            carrierId: adapter.id,
            resource: labelRes,
          });
        }

        context.logger?.info("Flow: Label created", {
          trackingNumber: labelRes.carrierId,
          labelUrl: (labelRes as any).labelUrl,
        });
      }
    }

    return result;
  } catch (error) {
    context.logger?.error("Flow: Error occurred", { error, step: "unknown" });

    result.errors.push({
      step: "unknown",
      error,
    });

    if (store) {
      await store.appendEvent(shipment.id, {
        type: "ERROR_OCCURRED",
        internalId: shipment.id,
        carrierId: adapter.id,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    throw error;
  }
}
