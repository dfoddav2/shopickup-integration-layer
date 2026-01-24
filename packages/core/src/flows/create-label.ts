import type {
  CarrierAdapter,
  AdapterContext,
  CarrierResource,
  LabelCarrierResource,
  Store,
  DomainEvent,
  CreateLabelRequest,
} from '../interfaces/index.js';
import type { Parcel, LabelResult } from '../types/index.js';
import { Capabilities } from '../interfaces/capabilities.js';

/**
 * Result of executeCreateLabelFlow
 */
export interface CreateLabelFlowResult {
  /** Resources created for each parcel */
  parcelResources: CarrierResource[];

  /** Results (with file mapping) for each label */
  labelResults: LabelResult[];

  /** Any errors that occurred during the flow */
  errors: Array<{ step: string; error: Error | CarrierResource }>;
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
    labelResults: [],
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

         const labelReq: CreateLabelRequest = {
           parcelCarrierId: parcelRes.carrierId,
           credentials,
         };

          const labelRes = await adapter.createLabel!(
            labelReq,
            context
          );

         result.labelResults.push(labelRes);

          if (store && labelRes.status === "created" && labelRes.fileId) {
            // Store the label result with file mapping
            const labelResource: LabelCarrierResource = {
              carrierId: labelRes.inputId,
              status: labelRes.status,
              fileId: labelRes.fileId,
              pageRange: labelRes.pageRange,
              raw: labelRes.raw,
            };
            await store.saveCarrierResource(parcel.id, "label", labelResource);
            await store.appendEvent(parcel.id, {
              type: "LABEL_GENERATED",
              internalId: parcel.id,
              carrierId: adapter.id,
              resource: labelResource,
            });
          }

         context.logger?.info("Flow: Label created", {
           inputId: labelRes.inputId,
           status: labelRes.status,
           fileId: labelRes.fileId,
         });
      }
    }

    return result;
  } catch (error) {
    // Convert unknown to a properly typed error
    const typedError = error instanceof Error ? error : new Error(String(error));
    
    context.logger?.error("Flow: Error occurred", { error: typedError.message, step: "unknown" });

    result.errors.push({
      step: "unknown",
      error: typedError,
    });

    if (store) {
      await store.appendEvent(parcels[0]?.id || "unknown", {
        type: "ERROR_OCCURRED",
        internalId: parcels[0]?.id || "unknown",
        carrierId: adapter.id,
        details: { errorMessage: typedError.message },
      });
    }

    throw error;
  }
}
