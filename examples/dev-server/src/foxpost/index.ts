/**
 * Foxpost Routes - Main Export
 * Registers all Foxpost route handlers to Fastify instance
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { withOperationName, withCallTracing, composeAdapterWrappers, type CarrierAdapter } from '@shopickup/core';
import { registerCreateParcelRoute } from './create-parcel.js';
import { registerCreateParcelsRoute } from './create-parcels.js';
import { registerCreateLabelRoute } from './create-label.js';
import { registerCreateLabelsRoute } from './create-labels.js';
import { registerTrackRoute } from './track.js';
import { registerPickupPointsRoute } from './get-pickup-points.js';

/**
 * Register all Foxpost routes to the Fastify instance
 * 
 * Routes registered:
 * - POST /api/dev/foxpost/create-parcel (single parcel)
 * - POST /api/dev/foxpost/create-parcels (batch)
 * - POST /api/dev/foxpost/create-label (single label)
 * - POST /api/dev/foxpost/create-labels (batch labels)
 * - POST /api/dev/foxpost/track (tracking)
 * - GET /api/dev/foxpost/pickup-points (fetch APM list)
 * 
 * ### Example: Using Adapter Wrappers for Cross-Cutting Concerns
 * 
 * The adapter can be wrapped with higher-order functions to add features
 * without modifying adapter code:
 * 
 * ```typescript
 * // 1. Create base adapter
 * const baseAdapter = new FoxpostAdapter();
 * 
 * // 2. Wrap with operation name injection (enables per-operation logging control)
 * const withOps = withOperationName(baseAdapter);
 * 
 * // 3. Optionally add call tracing (logs timing info for monitoring)
 * const tracedAdapter = withCallTracing(withOps, fastify.log);
 * 
 * // Or use compose helper to apply multiple wrappers:
 * const adapter = composeAdapterWrappers(baseAdapter, [
 *   (a) => withOperationName(a),
 *   (a) => withCallTracing(a, fastify.log),
 * ]);
 * ```
 * 
 * Benefits:
 * - **Operation name injection**: Automatically sets context.operationName for each method
 * - **Silent operations support**: Control per-operation logging without code changes
 * - **Call tracing**: Measure adapter method performance
 * - **Transparent**: No changes needed in adapter implementation or route handlers
 * 
 * ### Using Silent Operations
 * 
 * In route handlers, you can suppress verbose logging for specific operations:
 * 
 * ```typescript
 * const ctx: AdapterContext = {
 *   http: httpClient,
 *   logger: fastify.log,
 *   loggingOptions: {
 *     silentOperations: ['fetchPickupPoints'],  // Don't log this operation
 *   }
 * };
 * 
 * // Now this call won't produce verbose logs
 * const pickupPoints = await adapter.fetchPickupPoints(req, ctx);
 * ```
 */
export async function registerFoxpostRoutes(fastify: FastifyInstance) {
  // Create base adapter
  const baseAdapter = new FoxpostAdapter();
  
  // Apply wrappers for cross-cutting concerns:
  // 1. withOperationName: automatically injects operation name into context
  // 2. withCallTracing: logs method timing information
  const adapter = composeAdapterWrappers(baseAdapter, [
    (a: CarrierAdapter) => withOperationName(a),
    (a: CarrierAdapter) => withCallTracing(a, fastify.log),
  ]);

  // Register individual route handlers
  await registerCreateParcelRoute(fastify, adapter as any);
  await registerCreateParcelsRoute(fastify, adapter as any);
  await registerCreateLabelRoute(fastify, adapter as any);
  await registerCreateLabelsRoute(fastify, adapter as any);
  await registerTrackRoute(fastify, adapter as any);
  await registerPickupPointsRoute(fastify, adapter as any);
}

// Export common utilities for tests or external use
export * from './common.js';
