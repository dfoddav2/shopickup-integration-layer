/**
 * GLS: Create Parcels (Batch) Route Handler
 * POST /api/dev/gls/create-parcels
 * 
 * Creates multiple parcels via GLS PrepareLabels endpoint.
 * Returns parcel IDs that can be used for label generation.
 */

import { FastifyInstance } from 'fastify';
import { GLSAdapter } from '@shopickup/adapters-gls';
import { CarrierError, type AdapterContext, type CreateParcelsRequest, type Parcel } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';

const GLS_CREDENTIALS_SCHEMA = {
  type: 'object',
  required: ['username', 'password', 'clientNumberList'],
  properties: {
    username: {
      type: 'string',
      description: 'MyGLS username (email address)',
      example: 'integration@example.com',
    },
    password: {
      type: 'string',
      description: 'MyGLS password (will be SHA512-hashed by adapter)',
      example: 'myPassword123',
    },
    clientNumberList: {
      type: 'array',
      items: { type: 'integer' },
      minItems: 1,
      description: 'GLS client/account numbers',
      example: [12345],
    },
    webshopEngine: {
      type: 'string',
      description: 'Optional webshop engine identifier',
      example: 'shopickup-adapter/1.0',
    },
  },
};

const PARCEL_SCHEMA = {
  type: 'object',
  required: ['weight', 'sender', 'recipient'],
  properties: {
    id: {
      type: 'string',
      description: 'Unique order/reference identifier',
      example: 'ORDER-2025-001',
    },
    weight: {
      type: 'integer',
      description: 'Weight in grams',
      example: 1200,
    },
    sender: {
      type: 'object',
      required: ['name', 'street', 'city', 'postalCode', 'country'],
      properties: {
        name: { type: 'string', example: 'Sender Company' },
        street: { type: 'string', example: 'Main St 1' },
        city: { type: 'string', example: 'Budapest' },
        postalCode: { type: 'string', example: '1011' },
        country: { type: 'string', pattern: '^[A-Z]{2}$', example: 'HU' },
        phone: { type: 'string', example: '+36 1 234 5678' },
        email: { type: 'string', format: 'email' },
      },
    },
    recipient: {
      type: 'object',
      required: ['name', 'street', 'city', 'postalCode', 'country'],
      properties: {
        name: { type: 'string', example: 'John Doe' },
        street: { type: 'string', example: 'Delivery St 42' },
        city: { type: 'string', example: 'Szeged' },
        postalCode: { type: 'string', example: '6720' },
        country: { type: 'string', pattern: '^[A-Z]{2}$', example: 'HU' },
        phone: { type: 'string', example: '+36 66 123 4567' },
        email: { type: 'string', format: 'email' },
      },
    },
  },
};

const BATCH_PARCEL_RESPONSE_SCHEMA = {
  200: {
    description: 'Parcels created successfully (or partial success)',
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'object',
              properties: {
                inputId: { type: 'string' },
                status: { type: 'string', enum: ['created'] },
                carrierId: { type: 'string' },
              },
            },
            {
              type: 'object',
              properties: {
                inputId: { type: 'string' },
                status: { type: 'string', enum: ['failed'] },
                errorMessage: { type: 'string' },
                errorCode: { type: 'string' },
              },
            },
          ],
        },
      },
      successCount: { type: 'integer' },
      failureCount: { type: 'integer' },
      totalCount: { type: 'integer' },
      allSucceeded: { type: 'boolean' },
      allFailed: { type: 'boolean' },
      someFailed: { type: 'boolean' },
      summary: { type: 'string' },
    },
  },
  400: {
    description: 'Bad request - validation error',
    type: 'object',
    properties: {
      message: { type: 'string' },
      category: { type: 'string', enum: ['Validation'] },
    },
  },
  401: {
    description: 'Unauthorized - authentication failed',
    type: 'object',
    properties: {
      message: { type: 'string' },
      category: { type: 'string', enum: ['Auth', 'Permanent'] },
    },
  },
  500: {
    description: 'Server error',
    type: 'object',
    properties: {
      message: { type: 'string' },
      category: { type: 'string' },
    },
  },
};

export async function registerCreateParcelsRoute(
  fastify: FastifyInstance,
  adapter: GLSAdapter
) {
  fastify.post('/api/dev/gls/create-parcels', {
    schema: {
      description: 'Create multiple GLS parcels (dev endpoint for testing)',
      tags: ['GLS'],
      summary: 'Batch create parcels',
      body: {
        type: 'object',
        required: ['parcels', 'credentials'],
        properties: {
          parcels: {
            type: 'array',
            items: PARCEL_SCHEMA,
            minItems: 1,
            description: 'Array of parcels to create',
          },
          credentials: GLS_CREDENTIALS_SCHEMA,
          options: {
            type: 'object',
            description: 'Optional request options',
            properties: {
              country: {
                type: 'string',
                description: 'ISO 3166-1 alpha-2 country code (default: HU)',
                example: 'HU',
              },
              useTestApi: {
                type: 'boolean',
                description: 'Use test API endpoint instead of production',
                default: false,
              },
            },
          },
        },
        examples: [
          {
            parcels: [
              {
                id: 'ORDER-2025-001',
                weight: 1200,
                sender: {
                  name: 'Sender Company',
                  street: 'Main St 1',
                  city: 'Budapest',
                  postalCode: '1011',
                  country: 'HU',
                  phone: '+36 1 234 5678',
                  email: 'sender@example.com',
                },
                recipient: {
                  name: 'John Doe',
                  street: 'Delivery St 42',
                  city: 'Szeged',
                  postalCode: '6720',
                  country: 'HU',
                  phone: '+36 66 123 4567',
                  email: 'john@example.com',
                },
              },
              {
                id: 'ORDER-2025-002',
                weight: 800,
                sender: {
                  name: 'Sender Company',
                  street: 'Main St 1',
                  city: 'Budapest',
                  postalCode: '1011',
                  country: 'HU',
                },
                recipient: {
                  name: 'Jane Smith',
                  street: 'Other St 99',
                  city: 'Debrecen',
                  postalCode: '4024',
                  country: 'HU',
                },
              },
            ],
            credentials: {
              username: 'integration@example.com',
              password: 'myPassword123',
              clientNumberList: [12345],
            },
            options: { useTestApi: true, country: 'HU' },
          },
        ],
      },
      response: BATCH_PARCEL_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        const { parcels, credentials, options } = request.body as any;

        const createReq: CreateParcelsRequest = {
          parcels: parcels as Parcel[],
          credentials,
          options,
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
          operationName: 'createParcels',
          loggingOptions: {
            silentOperations: [],
            maxArrayItems: 50,
            maxDepth: 3,
            logRawResponse: 'summary',
            logMetadata: true,
          },
        };

        // Call adapter
        const parcelResponse = await adapter.createParcels(createReq, ctx);

        // Determine HTTP status based on results
        const statusCode =
          parcelResponse.allSucceeded ? 200 :
          parcelResponse.allFailed ? 400 :
          parcelResponse.someFailed ? 207 : // Multi-status for partial success
          200;

        return reply.status(statusCode).send({
          results: parcelResponse.results,
          successCount: parcelResponse.successCount,
          failureCount: parcelResponse.failureCount,
          totalCount: parcelResponse.totalCount,
          allSucceeded: parcelResponse.allSucceeded,
          allFailed: parcelResponse.allFailed,
          someFailed: parcelResponse.someFailed,
          summary: parcelResponse.summary,
        });
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          const statusCode =
            error.category === 'Auth' ? 401 :
            error.category === 'Validation' ? 400 :
            error.category === 'Permanent' ? 403 :
            500;

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
