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
      tags: ['Foxpost'],
      summary: 'Fetch pickup points',
      querystring: {
        type: 'object',
        properties: {
          country: {
            type: 'string',
            description: 'Optional ISO 3166-1 alpha-2 country filter (e.g. hu)',
            minLength: 2,
            maxLength: 2,
          },
          north: {
            type: 'number',
            description: 'Optional bbox north latitude (requires south, east, west)',
          },
          south: {
            type: 'number',
            description: 'Optional bbox south latitude (requires north, east, west)',
          },
          east: {
            type: 'number',
            description: 'Optional bbox east longitude (requires north, south, west)',
          },
          west: {
            type: 'number',
            description: 'Optional bbox west longitude (requires north, south, east)',
          },
        },
      },
      response: PICKUP_POINTS_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        const { country, north, south, east, west } = request.query || {};

        const hasAnyBbox = [north, south, east, west].some((v) => v !== undefined);
        const hasAllBbox = [north, south, east, west].every((v) => v !== undefined);
        if (hasAnyBbox && !hasAllBbox) {
          return reply.status(400).send({
            message: 'Invalid request: provide all bbox params (north, south, east, west) together',
            category: 'Validation',
          });
        }

        // Build pickup points request
        const req = {
          credentials: undefined, // Public feed, no authentication needed
          options: {
            foxpost: {
              ...(country ? { country: String(country).toLowerCase() } : {}),
              ...(hasAllBbox
                ? {
                    bbox: {
                      north: Number(north),
                      south: Number(south),
                      east: Number(east),
                      west: Number(west),
                    },
                  }
                : {}),
            },
          },
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
