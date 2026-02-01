/**
 * GLS Routes - Main Export
 * Registers all GLS route handlers to Fastify instance
 */

import { FastifyInstance } from 'fastify';
import { GLSAdapter } from '@shopickup/adapters-gls';
import { withOperationName, withCallTracing, composeAdapterWrappers, type CarrierAdapter } from '@shopickup/core';
import { registerPickupPointsRoute } from './pickup-points.js';
import { registerCreateParcelsRoute } from './create-parcels.js';
import { registerCreateLabelsRoute } from './create-labels.js';
import { registerPrintLabelsRoute } from './print-labels.js';
import { registerTrackRoute } from './track.js';

/**
 * Register all GLS routes to the Fastify instance
 *
 * Routes registered:
 * - GET /api/dev/gls/pickup-points?country=hu (fetch pickup points)
 * - POST /api/dev/gls/create-parcels (create multiple parcels)
 * - POST /api/dev/gls/create-labels (create labels for parcels - two-step GetPrintData)
 * - POST /api/dev/gls/print-labels (create and print labels in one step - PrintLabels)
 * - POST /api/dev/gls/track (track a parcel)
 *
 * The GLS adapter is wrapped with:
 * 1. withOperationName: automatically injects operation name into context
 * 2. withCallTracing: logs method timing information
 */
export async function registerGLSRoutes(fastify: FastifyInstance) {
  // Create base adapter
  const baseAdapter = new GLSAdapter();

  // Apply wrappers for cross-cutting concerns:
  // 1. withOperationName: automatically injects operation name into context
  // 2. withCallTracing: logs method timing information
  const adapter = composeAdapterWrappers(baseAdapter, [
    (a: CarrierAdapter) => withOperationName(a),
    (a: CarrierAdapter) => withCallTracing(a, fastify.log),
  ]);

  // Register route handlers
  await registerPickupPointsRoute(fastify, adapter as any);
  await registerCreateParcelsRoute(fastify, adapter as any);
  await registerCreateLabelsRoute(fastify, adapter as any);
  await registerPrintLabelsRoute(fastify, adapter as any);
  await registerTrackRoute(fastify, adapter as any);
}

// Export common utilities for tests or external use
export * from './common.js';
