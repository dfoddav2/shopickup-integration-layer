/**
 * MPL: Track Parcels Batch (Pull-500) Route Handler
 * POST /api/dev/mpl/track-pull500-start - Submit batch tracking request
 * POST /api/dev/mpl/track-pull500-check - Poll for results
 * 
 * Two-phase protocol for batch tracking:
 * 1. Submit up to 500 tracking numbers → get trackingGUID
 * 2. Poll with trackingGUID → get status and results when ready
 * 
 * Status progression: NEW → INPROGRESS → READY (or ERROR)
 * Note: Results take 1+ minutes to generate. Poll with backoff.
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

const PULL500_STATUS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    trackingGUID: {
      type: 'string',
      description: 'UUID for polling results (only in start response)',
    },
    status: {
      type: 'string',
      enum: ['NEW', 'INPROGRESS', 'READY', 'ERROR'],
      description: 'Current processing status',
    },
    report: {
      type: 'string',
      nullable: true,
      description: 'CSV-formatted tracking data (when status=READY)',
    },
    report_fields: {
      type: 'string',
      nullable: true,
      description: 'CSV header row (when status=READY)',
    },
    errors: {
      type: 'array',
      nullable: true,
      description: 'Error descriptors (if status=ERROR)',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
  },
};

export async function registerPull500Routes(
  fastify: FastifyInstance,
  adapter: CarrierAdapter
) {
  /**
   * Start Pull-500 batch tracking request
   */
  fastify.post('/api/dev/mpl/track-pull500-start', {
    schema: {
      description: 'Submit batch tracking request (up to 500 parcels)',
      tags: ['MPL', 'Dev', 'Batch'],
      summary: 'Start Pull-500 batch tracking',
      body: {
        type: 'object',
        properties: {
          trackingNumbers: {
            type: 'array',
            minItems: 1,
            maxItems: 500,
            items: { type: 'string' },
            description: 'Array of tracking numbers (1-500)',
          },
          credentials: MPL_CREDENTIALS_SCHEMA,
          language: {
            type: 'string',
            enum: ['hu', 'en'],
            default: 'hu',
            description: 'Response language: Hungarian (hu) or English (en)',
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
        required: ['trackingNumbers', 'credentials'],
        examples: [
          {
            trackingNumbers: ['CL12345678901', 'CL98765432109'],
            credentials: {
              apiKey: 'your-api-key',
              apiSecret: 'your-api-secret',
            },
            language: 'hu',
            options: {
              useTestApi: false,
            },
          },
        ],
      },
      response: {
        200: {
          description: 'Batch request submitted',
          type: 'object',
          properties: {
            trackingGUID: {
              type: 'string',
              description: 'UUID for polling results',
            },
            errors: {
              type: 'array',
              nullable: true,
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
        401: MPL_AUTHENTICATION_ERROR_SCHEMA,
        429: {
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
          operationName: 'trackPull500Start',
        };

        // Dynamic import to get the function
        const { trackPull500Start } = await import('@shopickup/adapters-mpl');

        // Call the trackPull500Start function
        const response = await trackPull500Start(request.body, ctx, (opts: any) =>
          opts?.useTestApi
            ? 'https://test.api.mpl.hu'
            : 'https://api.mpl.hu'
        );

        return reply.status(200).send(response);
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

  /**
   * Check Pull-500 batch tracking results
   */
  fastify.post('/api/dev/mpl/track-pull500-check', {
    schema: {
      description: 'Poll for Pull-500 batch tracking results',
      tags: ['MPL', 'Dev', 'Batch'],
      summary: 'Check Pull-500 batch status and results',
      body: {
        type: 'object',
        properties: {
          trackingGUID: {
            type: 'string',
            description: 'UUID returned from start request',
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
        required: ['trackingGUID', 'credentials'],
        examples: [
          {
            trackingGUID: '550e8400-e29b-41d4-a716-446655440000',
            credentials: {
              apiKey: 'your-api-key',
              apiSecret: 'your-api-secret',
            },
            options: {
              useTestApi: false,
            },
          },
        ],
      },
      response: {
        200: {
          description: 'Current status of batch processing',
          ...PULL500_STATUS_RESPONSE_SCHEMA,
        },
        400: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' },
          },
        },
        401: MPL_AUTHENTICATION_ERROR_SCHEMA,
        429: {
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
          operationName: 'trackPull500Check',
        };

        // Dynamic import to get the function
        const { trackPull500Check } = await import('@shopickup/adapters-mpl');

        // Call the trackPull500Check function
        const response = await trackPull500Check(request.body, ctx, (opts: any) =>
          opts?.useTestApi
            ? 'https://test.api.mpl.hu'
            : 'https://api.mpl.hu'
        );

        return reply.status(200).send(response);
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
