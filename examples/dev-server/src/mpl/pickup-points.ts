/**
 * MPL: Fetch Pickup Points Route Handler
 * POST /api/dev/mpl/pickup-points
 */

import { FastifyInstance } from 'fastify';
import type { CarrierAdapter } from '@shopickup/core';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  MPL_PICKUP_POINTS_RESPONSE_SCHEMA,
} from './common.js';

export async function registerPickupPointsRoute(
  fastify: FastifyInstance,
  adapter: CarrierAdapter
) {
  fastify.post('/api/dev/mpl/pickup-points', {
    schema: {
      description: 'Fetch list of MPL pickup points (delivery places)',
      tags: ['MPL', 'Dev'],
      summary: 'Fetch pickup points',
      body: {
        type: 'object',
        properties: {
          credentials: {
            type: 'object',
            description: 'MPL API credentials (apiKey+apiSecret OR oAuth2Token)',
            properties: {
              authType: {
                type: 'string',
                enum: ['apiKey', 'oauth2'],
                description: 'Authentication method (auto-detected if omitted)'
              },
              apiKey: { type: 'string', description: 'For apiKey auth' },
              apiSecret: { type: 'string', description: 'For apiKey auth' },
              oAuth2Token: { type: 'string', description: 'For oauth2 auth' },
            }
          },
          accountingCode: {
            type: 'string',
            description: 'MPL accounting code for the request',
          },
          postCode: {
            type: 'string',
            description: 'Optional: filter by postal code (4 characters)',
          },
          city: {
            type: 'string',
            description: 'Optional: filter by city name',
          },
          servicePointType: {
            type: 'string',
            enum: ['PM', 'PP', 'CS'],
            description: 'Optional: filter by service point type (PM=Post Office, PP=Post Point, CS=Parcel Locker)',
          },
          options: {
            type: 'object',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API endpoint',
                default: false
              }
            }
          }
        },
        required: ['credentials', 'accountingCode'],
        examples: [
          {
            credentials: {
              apiKey: 'your-api-key',
              apiSecret: 'your-api-secret',
            },
            accountingCode: 'ACC123456',
            postCode: '',
            city: '',
            servicePointType: '',
          }
        ]
      },
      response: MPL_PICKUP_POINTS_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
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

        // Call adapter with full request body
        const pickupPointsResponse = await adapter.fetchPickupPoints!(request.body, ctx);

        return reply.status(200).send(pickupPointsResponse);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          // Map carrier error categories to HTTP status codes
          const statusCode =
            error.category === 'Auth' ? 401 :
              error.category === 'RateLimit' ? 429 :
                error.category === 'Validation' ? 400 :
                  error.category === 'Transient' ? 503 :
                    400;

          return reply.status(statusCode).send({
            message: error.message,
            category: error.category,
            ...(error.raw ? { raw: error.raw } : {}),
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
