/**
 * MPL: Create Parcels Route Handler
 * POST /api/dev/mpl/create-parcels
 * 
 * Handles batch creation of parcels/shipments in MPL.
 * 
 * Features:
 * - Create single parcel: POST with parcels array containing 1 item
 * - Create multiple parcels: POST with parcels array (up to 100)
 * - Automatic tracking number generation
 * - Optional label generation (if labelType specified)
 * - Partial failure handling (returns per-item results)
 * - Supports both API Key (Basic auth) and OAuth2 Bearer token authentication
 * 
 * Response includes:
 * - Per-parcel results with tracking numbers
 * - Success/failure counts and summary
 * - Label data (base64 encoded PDF if requested)
 * - Raw carrier response for debugging
 * 
 * Constraints:
 * - Maximum 100 shipments per request (MPL API limit)
 * - Requires agreement number (8-character contract ID)
 * - All parcels should have same sender (uses first parcel's shipper)
 */

import { FastifyInstance } from 'fastify';
import type { CarrierAdapter } from '@shopickup/core';
import { CarrierError, type AdapterContext, type CreateParcelsRequest } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';
import {
  MPL_CREDENTIALS_SCHEMA,
  MPL_OPTIONS_SCHEMA,
  MPL_AUTHENTICATION_ERROR_SCHEMA,
  EXAMPLE_MPL_CREDENTIALS_APIKEY,
} from './common.js';

/**
 * Canonical Parcel schema for dev server request
 * Simplified version for API documentation
 */
const CANONICAL_PARCEL_SCHEMA = {
  type: 'object',
  description: 'Canonical parcel domain object',
  properties: {
    id: {
      type: 'string',
      description: 'Unique parcel identifier (e.g., order ID)',
    },
    shipper: {
      type: 'object',
      description: 'Sender/shipper information',
      properties: {
        contact: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['name'],
        },
        address: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            street: { type: 'string' },
            city: { type: 'string' },
            postalCode: { type: 'string' },
            country: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['street', 'city', 'postalCode', 'country'],
        },
      },
      required: ['contact', 'address'],
    },
    recipient: {
      type: 'object',
      description: 'Recipient/receiver information',
      properties: {
        contact: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['name'],
        },
        delivery: {
          type: 'object',
          description: 'Delivery method: either HOME or PICKUP_POINT',
          // discriminator: { propertyName: 'method' },
          oneOf: [
            {
              type: 'object',
              properties: {
                method: { const: 'HOME' },
                address: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    street: { type: 'string' },
                    city: { type: 'string' },
                    postalCode: { type: 'string' },
                    country: { type: 'string' },
                  },
                  required: ['street', 'city', 'postalCode', 'country'],
                },
              },
              required: ['method', 'address'],
            },
            {
              type: 'object',
              properties: {
                method: { const: 'PICKUP_POINT' },
                pickupPoint: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    address: {
                      type: 'object',
                      properties: {
                        street: { type: 'string' },
                        city: { type: 'string' },
                        postalCode: { type: 'string' },
                        country: { type: 'string' },
                      },
                    },
                  },
                  required: ['id'],
                },
              },
              required: ['method', 'pickupPoint'],
            },
          ],
        },
      },
      required: ['contact', 'delivery'],
    },
    service: {
      type: 'string',
      enum: ['standard', 'express', 'economy', 'overnight'],
      description: 'Normalized service level',
    },
    carrierServiceCode: {
      type: 'string',
      description: 'Optional: MPL-specific service code (overrides service level)',
    },
    package: {
      type: 'object',
      properties: {
        weightGrams: { type: 'number' },
        dimensionsCm: {
          type: 'object',
          properties: {
            length: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
      },
      required: ['weightGrams'],
    },
    references: {
      type: 'object',
      description: 'Reference codes for tracking and reconciliation',
      properties: {
        orderId: { type: 'string' },
        customerReference: { type: 'string'},
      },
    },
    cod: {
      type: 'object',
      description: 'Cash on delivery configuration',
      properties: {
        amount: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            currency: { type: 'string' },
          },
          required: ['amount'],
        },
      },
    },
    declaredValue: {
      type: 'object',
      description: 'Declared value for insurance/customs',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
      },
    },
  },
  required: ['id', 'shipper', 'recipient', 'service', 'package'],
};

const CREATE_PARCELS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          carrierId: { type: 'string', description: 'Tracking number assigned by MPL' },
          status: { type: 'string', enum: ['created', 'failed'] },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
          raw: { type: 'object', description: 'Raw carrier response' },
        },
      },
    },
    successCount: { type: 'number' },
    failureCount: { type: 'number' },
    totalCount: { type: 'number' },
    allSucceeded: { type: 'boolean' },
    allFailed: { type: 'boolean' },
    someFailed: { type: 'boolean' },
    summary: { type: 'string' },
    rawCarrierResponse: { type: 'object', description: 'Full carrier response' },
  },
};

export async function registerCreateParcelsRoute(
  fastify: FastifyInstance,
  adapter: CarrierAdapter
) {
  fastify.post('/api/dev/mpl/create-parcels', {
    schema: {
      description: 'Create one or more parcels in MPL',
      tags: ['MPL', 'Dev'],
      summary: 'Create parcels (batch)',
      body: {
        type: 'object',
        properties: {
          credentials: MPL_CREDENTIALS_SCHEMA,
          parcels: {
            type: 'array',
            items: CANONICAL_PARCEL_SCHEMA,
            description: 'Array of canonical parcel objects (max 100)',
            minItems: 1,
            maxItems: 100,
          },
          options: {
            type: 'object',
            description: 'Optional request options',
            properties: {
              ...MPL_OPTIONS_SCHEMA.properties,
              labelType: {
                type: 'string',
                enum: ['A4', 'A5', 'A5inA4', 'A5E', 'A5E_EXTRA', 'A5E_STAND', 'A6', 'A6inA4', 'A4ONE'],
                description: 'Label size/format (A5 default)',
              },
              accountingCode: {
                type: 'string',
                description: 'MPL accounting code',
              },
            },
          },
        },
        required: ['credentials', 'parcels'],
        examples: [
          {
            credentials: EXAMPLE_MPL_CREDENTIALS_APIKEY,
            parcels: [
              {
                id: 'order-001',
                shipper: {
                  contact: { name: 'Sender Corp' },
                  address: {
                    name: 'Sender Corp',
                    street: 'Petőfi utca 1',
                    city: 'Budapest',
                    postalCode: '1011',
                    country: 'HU',
                  },
                },
                recipient: {
                  contact: { name: 'Jane Doe' },
                  delivery: {
                    method: 'HOME',
                    address: {
                      name: 'Jane Doe',
                      street: 'Main utca 42',
                      city: 'Debrecen',
                      postalCode: '4026',
                      country: 'HU',
                    },
                  },
                },
                service: 'standard',
                package: { weightGrams: 500 },
              },
            ],
            options: {
              useTestApi: false,
              accountingCode: 'ACC123456',
              labelType: 'A5',
            },
          },
        ],
      },
      response: {
        200: CREATE_PARCELS_RESPONSE_SCHEMA,
        400: MPL_AUTHENTICATION_ERROR_SCHEMA,
        401: MPL_AUTHENTICATION_ERROR_SCHEMA,
        429: MPL_AUTHENTICATION_ERROR_SCHEMA,
        503: MPL_AUTHENTICATION_ERROR_SCHEMA,
        500: { description: 'Internal server error' },
      },
    },
    async handler(request: any, reply: any) {
      try {
        // Validate HTTP client
        const httpClient = (fastify as any).httpClient;
        if (!httpClient) {
          return reply.status(500).send({
            message: 'HTTP client not configured',
            category: 'Internal',
          });
        }

        // Prepare adapter context
        const ctx: AdapterContext = {
          http: httpClient,
          logger: wrapPinoLogger(fastify.log),
          operationName: 'createParcels',
          loggingOptions: {
            silentOperations: [],
            maxArrayItems: 5,
            maxDepth: 3,
          },
        };

        // Build request object
        const createParcelsReq: CreateParcelsRequest = {
          parcels: request.body.parcels,
          credentials: request.body.credentials,
          options: request.body.options || {},
        };

        // Call adapter
        const response = await (adapter as any).createParcels!(createParcelsReq, ctx);

        return reply.status(200).send(response);
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

/**
 * Helper: Register create parcel (singular) endpoint
 * Delegates to createParcels with single-item array
 */
export async function registerCreateParcelRoute(
  fastify: FastifyInstance,
  adapter: CarrierAdapter
) {
  fastify.post('/api/dev/mpl/create-parcel', {
    schema: {
      description: 'Create a single parcel in MPL',
      tags: ['MPL', 'Dev'],
      summary: 'Create parcel (single)',
      body: {
        type: 'object',
        properties: {
          credentials: MPL_CREDENTIALS_SCHEMA,
          parcel: CANONICAL_PARCEL_SCHEMA,
          options: {
            type: 'object',
            properties: {
              ...MPL_OPTIONS_SCHEMA.properties,
              labelType: {
                type: 'string',
                enum: ['A4', 'A5', 'A5inA4', 'A5E', 'A5E_EXTRA', 'A5E_STAND', 'A6', 'A6inA4', 'A4ONE'],
              },
              accountingCode: {
                type: 'string',
              },
            },
          },
        },
        required: ['credentials', 'parcel'],
      },
      response: {
        200: CREATE_PARCELS_RESPONSE_SCHEMA,
        400: { description: 'Validation error' },
        401: { description: 'Authentication error' },
        500: { description: 'Internal server error' },
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
          operationName: 'createParcel',
        };

        // Call adapter with single parcel
        const response = await (adapter as any).createParcel!(
          {
            parcel: request.body.parcel,
            credentials: request.body.credentials,
            options: request.body.options || {},
          },
          ctx
        );

        return reply.status(200).send(response);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          const statusCode =
            error.category === 'Auth' ? 401 :
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
