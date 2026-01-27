/**
 * MPL: Track Parcel Route Handler
 * POST /api/dev/mpl/track
 * 
 * This endpoint tracks a parcel by its tracking number.
 * Returns current shipment state and tracking status.
 * 
 * Important: MPL provides shipment metadata, not full tracking history.
 * You get current state (in transit, pending, etc.) but not event history.
 */

import { FastifyInstance } from 'fastify';
import type { CarrierAdapter } from '@shopickup/core';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  MPL_AUTHENTICATION_ERROR_SCHEMA,
  MPL_CREDENTIALS_SCHEMA,
  MPL_OPTIONS_SCHEMA,
} from './common.js';

const MPL_TRACKING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    trackingNumber: {
      type: 'string',
      description: 'The tracking number being tracked',
    },
    status: {
      type: 'string',
      enum: ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION'],
      description: 'Current status of the shipment',
    },
    events: {
      type: 'array',
      description: 'Tracking events (typically 1 event for MPL = current state)',
      items: {
        type: 'object',
        properties: {
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Date/time of the tracking event',
          },
          status: {
            type: 'string',
            description: 'Status at this point in time',
          },
          location: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              country: { type: 'string' },
            },
            nullable: true,
          },
          description: {
            type: 'string',
            description: 'Human-readable event description',
          },
          raw: {
            type: 'object',
            description: 'Raw carrier response data',
          },
        },
      },
    },
    lastUpdate: {
      type: ['string', 'null'],
      format: 'date-time',
      description: 'Timestamp of last update',
    },
    rawCarrierResponse: {
      type: 'object',
      description: 'Full response from MPL API',
    },
  },
  required: ['trackingNumber', 'status', 'events', 'rawCarrierResponse'],
  responses: {
    200: {
      description: 'Tracking information retrieved successfully',
    },
    400: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        category: { type: 'string' },
      },
    },
    401: MPL_AUTHENTICATION_ERROR_SCHEMA,
    404: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        category: { type: 'string' },
      },
    },
    503: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        category: { type: 'string' },
      },
    },
  },
};

export async function registerTrackRoute(
  fastify: FastifyInstance,
  adapter: CarrierAdapter
) {
  fastify.post('/api/dev/mpl/track', {
    schema: {
      description: 'Track a parcel by tracking number',
      tags: ['MPL', 'Dev'],
      summary: 'Track parcel by tracking number',
      body: {
        type: 'object',
        properties: {
          trackingNumber: {
            type: 'string',
            description: 'The tracking number of the parcel to track',
          },
          credentials: MPL_CREDENTIALS_SCHEMA,
          options: {
            type: 'object',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API endpoint',
                default: false,
              },
            },
          },
        },
        required: ['trackingNumber', 'credentials'],
        examples: [
          {
            trackingNumber: '12345678',
            credentials: {
              apiKey: 'your-api-key',
              apiSecret: 'your-api-secret',
              accountingCode: 'ACC123456',
            },
            options: {
              useTestApi: false,
            },
          },
        ],
      },
      response: MPL_TRACKING_RESPONSE_SCHEMA,
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
          operationName: 'track',
        };

        // Call adapter with tracking request
        const trackingResponse = await adapter.track!(request.body, ctx);

        return reply.status(200).send(trackingResponse);
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

  /**
   * Track parcel using registered endpoint (with financial data)
   */
  fastify.post('/api/dev/mpl/track-registered', {
    schema: {
      description: 'Track a parcel using registered endpoint (includes financial data)',
      tags: ['MPL', 'Dev'],
      summary: 'Track parcel (registered - authenticated)',
      body: {
        type: 'object',
        properties: {
          trackingNumbers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of tracking numbers (use trackingNumber for single)',
          },
          trackingNumber: {
            type: 'string',
            description: 'Single tracking number (alternative to trackingNumbers array)',
          },
          credentials: MPL_CREDENTIALS_SCHEMA,
          state: {
            type: 'string',
            enum: ['last', 'all'],
            default: 'last',
            description: 'Return latest event only (last) or full history (all)',
          },
          options: {
            type: 'object',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API endpoint',
                default: false,
              },
            },
          },
        },
        required: ['credentials'],
        examples: [
          {
            trackingNumbers: ['CL12345678901'],
            credentials: {
              apiKey: 'your-api-key',
              apiSecret: 'your-api-secret',
              accountingCode: 'ACC123456',
            },
            state: 'last',
            options: {
              useTestApi: false,
            },
          },
        ],
      },
      response: MPL_TRACKING_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
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
          operationName: 'trackRegistered',
        };

        // Build tracking request (support both single and array)
        const trackingNumbers = request.body.trackingNumbers || [request.body.trackingNumber];

        const trackingRequest = {
          trackingNumbers,
          credentials: request.body.credentials,
          state: request.body.state || 'last',
          useRegisteredEndpoint: true,  // Force registered endpoint
          options: request.body.options,
        };

        // Dynamic import to get the trackRegistered function
        const { trackRegistered } = await import('@shopickup/adapters-mpl');

        // Call the trackRegistered function directly
        const trackingResponse = await trackRegistered(trackingRequest, ctx, (opts: any) =>
          opts?.useTestApi
            ? 'https://test.api.mpl.hu'
            : 'https://api.mpl.hu'
        );

        return reply.status(200).send(trackingResponse);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
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
