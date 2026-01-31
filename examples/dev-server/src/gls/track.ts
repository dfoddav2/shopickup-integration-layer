/**
 * GLS: Track Parcel Route Handler
 * POST /api/dev/gls/track
 */

import { FastifyInstance } from 'fastify';
import { GLSAdapter } from '@shopickup/adapters-gls';
import { CarrierError, type AdapterContext } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';

export async function registerTrackRoute(fastify: FastifyInstance, adapter: GLSAdapter) {
  fastify.post('/api/dev/gls/track', {
    schema: {
      description: 'Track a GLS parcel by tracking number',
      tags: ['GLS'],
      summary: 'Track GLS parcel',
      body: {
        type: 'object',
        properties: {
          trackingNumber: {
            type: 'string',
            description: 'GLS parcel number (numeric)',
          },
          credentials: {
            type: 'object',
            properties: {
              username: {
                type: 'string',
                description: 'MyGLS API username',
              },
              password: {
                type: 'string',
                description: 'MyGLS API password',
              },
              clientNumberList: {
                type: 'array',
                items: { type: 'integer' },
                description: 'List of GLS client numbers',
              },
            },
            required: ['username', 'password', 'clientNumberList'],
          },
          options: {
            type: 'object',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API',
                default: false,
              },
            },
          },
        },
        required: ['trackingNumber', 'credentials'],
        examples: [
          {
            trackingNumber: '123456789',
            credentials: {
              username: 'integration@example.com',
              password: 'myPassword123',
              clientNumberList: [12345],
            },
            options: {
              useTestApi: true,
            },
          },
          {
            trackingNumber: '987654321',
            credentials: {
              username: 'api@mygls.hu',
              password: 'secure_password_123',
              clientNumberList: [10001, 10002],
            },
            options: {
              useTestApi: false,
            },
          },
        ],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            trackingNumber: { type: 'string' },
            status: { type: 'string' },
            lastUpdate: { type: ['string', 'null'] },
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string' },
                  status: { type: 'string' },
                  carrierStatusCode: { type: 'string' },
                  description: { type: 'string' },
                  location: {
                    type: 'object',
                    properties: {
                      city: { type: 'string' },
                      facility: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' },
          },
        },
        500: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' },
          },
        },
      },
    },
    async handler(request: any, reply: any) {
      try {
        // Extract request body
        const { trackingNumber, credentials, options } = request.body;

        // Validate required fields
        if (!trackingNumber) {
          return reply.status(400).send({
            message: 'Tracking number is required',
            category: 'Validation',
          });
        }

        if (!credentials || !credentials.username || !credentials.password || !credentials.clientNumberList) {
          return reply.status(400).send({
            message: 'Credentials (username, password, clientNumberList) are required',
            category: 'Validation',
          });
        }

        // Build track request
        const req = {
          trackingNumber: String(trackingNumber),
          credentials: {
            username: credentials.username,
            password: credentials.password,
            clientNumberList: credentials.clientNumberList,
          },
          options: {
            useTestApi: options?.useTestApi || false,
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
          operationName: 'track',
          loggingOptions: {
            logRawResponse: 'summary',
            logMetadata: true,
            maxDepth: 2,
          },
        };

        // Call adapter
        // Cast to any to avoid type issues with newly added track method
        const trackingUpdate = await (adapter as any).track(req, ctx);

        return reply.status(200).send({
          trackingNumber: trackingUpdate.trackingNumber,
          status: trackingUpdate.status,
          lastUpdate: trackingUpdate.lastUpdate ? trackingUpdate.lastUpdate.toISOString() : null,
          events: trackingUpdate.events.map((event: any) => ({
            timestamp: event.timestamp.toISOString(),
            status: event.status,
            carrierStatusCode: event.carrierStatusCode,
            description: event.description,
            location: event.location ? {
              city: event.location.city,
              facility: event.location.facility,
            } : undefined,
          })),
        });
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          // Map carrier error categories to HTTP status codes
          const statusCode =
            error.category === 'Permanent' && error.message.includes('not found') ? 404 :
            error.category === 'Auth' ? 401 :
            error.category === 'Validation' ? 400 :
            500; // Transient and RateLimit errors get 500

          return reply.status(statusCode).send({
            message: error.message,
            category: error.category,
            ...(error.carrierCode && { carrierCode: error.carrierCode }),
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
