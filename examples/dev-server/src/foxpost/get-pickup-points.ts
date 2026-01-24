/**
 * Foxpost: Fetch Pickup Points Route Handler
 * GET /api/dev/foxpost/pickup-points
 */

import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  PICKUP_POINTS_RESPONSE_SCHEMA,
} from './common.js';

export async function registerPickupPointsRoute(
  fastify: FastifyInstance,
  adapter: FoxpostAdapter
) {
  fastify.get('/api/dev/foxpost/pickup-points', {
    schema: {
      description: 'Fetch list of Foxpost pickup points (APMs)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Fetch pickup points',
      response: PICKUP_POINTS_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        // Build pickup points request
        const req = {
          credentials: undefined, // Public feed, no authentication needed
        };

        // Prepare adapter context
        const httpClient = (fastify as any).httpClient;
        if (!httpClient) {
          return reply.status(500).send({
            message: 'HTTP client not configured',
            category: 'Internal',
          });
        }
        const ctx: AdapterContext = {
          http: httpClient,
          logger: wrapPinoLogger(fastify.log),
          operationName: 'fetchPickupPoints',
          loggingOptions: {
            // Silent by default to prevent verbose APM list logging
            silentOperations: ['fetchPickupPoints'],
            maxArrayItems: 10,
            maxDepth: 2,
            logRawResponse: 'summary',
            logMetadata: false,
          },
        };

        // Call adapter
        const pickupPointsResponse = await adapter.fetchPickupPoints(req, ctx);

        return reply.status(200).send(pickupPointsResponse);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          // Map carrier error categories to HTTP status codes
          const statusCode = error.category === 'Auth' ? 401 : 400;
          return reply.status(statusCode).send({
            message: error.message,
            category: error.category,
            ...(error.carrierCode && { carrierCode: error.carrierCode }),
            raw: error.raw,
          });
        }

        return reply.status(500).send({
          message: error instanceof Error ? error.message : String(error),
          category: 'Internal',
        });
      }
    },
  });
}
