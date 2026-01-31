/**
 * MPL: Get Shipment Details Route Handler
 * POST /api/dev/mpl/shipment-details
 * 
 * This endpoint retrieves shipment metadata by tracking number.
 * Returns sender, recipient, items, and shipment state information.
 * 
 * Note: This returns shipment metadata, NOT tracking event history.
 * For tracking events, use the /api/dev/mpl/track endpoint.
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

const MPL_SHIPMENT_DETAILS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    trackingNumber: {
      type: 'string',
      description: 'The tracking/shipment number',
    },
    orderId: {
      type: ['string', 'null'],
      description: 'Order ID if applicable',
    },
    shipmentDate: {
      type: ['string', 'null'],
      format: 'date-time',
      description: 'Date the shipment was created',
    },
    sender: {
      type: 'object',
      description: 'Sender address details',
      properties: {
        name: { type: ['string', 'null'] },
        street: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
        postalCode: { type: ['string', 'null'] },
        country: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
      },
    },
    recipient: {
      type: 'object',
      description: 'Recipient address details',
      properties: {
        name: { type: ['string', 'null'] },
        street: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
        postalCode: { type: ['string', 'null'] },
        country: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
      },
    },
    items: {
      type: 'array',
      description: 'Items in the shipment',
      items: {
        type: 'object',
        properties: {
          id: { type: ['string', 'null'] },
          weight: { type: ['number', 'null'] },
        },
      },
    },
    raw: {
      type: 'object',
      description: 'Full response from MPL API',
    },
  },
  required: ['raw'],
  // Fastify expects per-status response mappings at the route level.
};

export async function registerShipmentDetailsRoute(
  fastify: FastifyInstance,
  adapter: CarrierAdapter
) {
  fastify.post('/api/dev/mpl/shipment-details', {
    schema: {
      description: 'Get shipment details by tracking number',
      tags: ['MPL', 'Dev'],
      summary: 'Get shipment details including sender, recipient, items',
      body: {
        type: 'object',
        properties: {
          trackingNumber: {
            type: 'string',
            description: 'The tracking/shipment number to get details for',
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
      response: {
        200: MPL_SHIPMENT_DETAILS_RESPONSE_SCHEMA,
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
          operationName: 'getShipmentDetails',
        };

        // Call adapter with shipment details request
        const shipmentDetailsResponse = await adapter.getShipmentDetails!(request.body, ctx);

        return reply.status(200).send(shipmentDetailsResponse);
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
