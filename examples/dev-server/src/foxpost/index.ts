/**
 * Foxpost Routes - Main Export
 * Registers all Foxpost route handlers to Fastify instance
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
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
 */
export async function registerFoxpostRoutes(fastify: FastifyInstance) {
  const adapter = new FoxpostAdapter();

  // Register individual route handlers
  await registerCreateParcelRoute(fastify, adapter);
  await registerCreateParcelsRoute(fastify, adapter);
  await registerCreateLabelRoute(fastify, adapter);
  await registerCreateLabelsRoute(fastify, adapter);
  await registerTrackRoute(fastify, adapter);
  await registerPickupPointsRoute(fastify, adapter);
}

// Export common utilities for tests or external use
export * from './common.js';
