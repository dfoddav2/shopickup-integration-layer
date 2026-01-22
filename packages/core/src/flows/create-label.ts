import type {
  CarrierAdapter,
  AdapterContext,
  CarrierResource,
  Store,
  DomainEvent,
} from '../interfaces/index.js';
import type { Parcel } from '../types/index.js';
import { Capabilities } from '../interfaces/capabilities.js';

/**
 * Result of executeCreateLabelFlow
 */
export interface CreateLabelFlowResult {
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
 * 1. Create parcels (if supported)
 * 2. Create labels (if supported)
 *
 * @param opts Options for the flow
 * @returns Result with created resources
 */
export async function executeCreateLabelFlow(opts: {
  adapter: CarrierAdapter;
  parcels: Parcel[];
  credentials: Record<string, unknown>;
  context: AdapterContext;
  store?: Store;
}): Promise<CreateLabelFlowResult> {
  const { adapter, parcels, credentials, context, store } = opts;

  const result: CreateLabelFlowResult = {
    parcelResources: [],
    labelResources: [],
    errors: [],
  };

  try {
    // Step 1: Create parcels (if supported)
    if (adapter.capabilities.includes(Capabilities.CREATE_PARCEL)) {
      for (const parcel of parcels) {
         context.logger?.debug("Flow: Creating parcel", {
           parcelId: parcel.id,
           weight: parcel.package.weightGrams,
         });

        const parcelRes = await adapter.createParcel!(
          { parcel, credentials },
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

    // Step 2: Create labels (for each parcel if supported)
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
      await store.appendEvent(parcels[0]?.id || "unknown", {
        type: "ERROR_OCCURRED",
        internalId: parcels[0]?.id || "unknown",
        carrierId: adapter.id,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
    }

    throw error;
  }
}
