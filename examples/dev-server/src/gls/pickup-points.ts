/**
 * GLS: Fetch Pickup Points Route Handler
 * GET /api/dev/gls/pickup-points?country=hu
 */

import { FastifyInstance } from 'fastify';
import { GLSAdapter } from '@shopickup/adapters-gls';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import { GLS_PICKUP_POINTS_RESPONSE_SCHEMA, GLS_SUPPORTED_COUNTRIES } from './common.js';

export async function registerPickupPointsRoute(fastify: FastifyInstance, adapter: GLSAdapter) {
  fastify.get('/api/dev/gls/pickup-points', {
    schema: {
      description: 'Fetch list of GLS pickup points/delivery locations',
      tags: ['GLS'],
      summary: 'Fetch GLS pickup points',
       querystring: {
         type: 'object',
         properties: {
           country: {
             type: 'string',
             description: `ISO 3166-1 alpha-2 country code. Supported: ${GLS_SUPPORTED_COUNTRIES.join(', ')}`,
             minLength: 2,
             maxLength: 2,
           },
         },
         required: ['country'],
       },
      response: GLS_PICKUP_POINTS_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        // Extract country from query parameters
        const { country } = request.query;

        if (!country) {
          return reply.status(400).send({
            message: 'Country code is required (e.g., ?country=hu)',
            category: 'Validation',
          });
        }

        // Build pickup points request with country in options
        const req = {
          credentials: undefined, // Public feed, no authentication needed
          options: {
            country: country.toLowerCase(),
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
            // Silent by default to prevent verbose pickup point list logging
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
          const statusCode = error.category === 'Auth' ? 401 : error.category === 'Validation' ? 400 : 500;
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
