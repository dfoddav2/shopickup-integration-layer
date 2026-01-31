/**
 * GLS: Create Labels (Batch) Route Handler
 * POST /api/dev/gls/create-labels
 * 
 * Generates PDF labels for existing GLS parcels.
 * Requires parcel IDs from a prior CREATE_PARCELS call.
 */

import { FastifyInstance } from 'fastify';
import { GLSAdapter } from '@shopickup/adapters-gls';
import { CarrierError, type AdapterContext, type CreateLabelsRequest } from '@shopickup/core';
import { wrapPinoLogger } from '../http-client.js';

const GLS_CREDENTIALS_SCHEMA = {
  type: 'object',
  required: ['username', 'password', 'clientNumberList'],
  properties: {
    username: {
      type: 'string',
      description: 'MyGLS username (email address)',
    },
    password: {
      type: 'string',
      description: 'MyGLS password (will be SHA512-hashed by adapter)',
    },
    clientNumberList: {
      type: 'array',
      items: { type: 'integer' },
      minItems: 1,
      description: 'GLS client/account numbers',
    },
    webshopEngine: {
      type: 'string',
      description: 'Optional webshop engine identifier',
    },
  },
};

const BATCH_LABEL_RESPONSE_SCHEMA = {
  200: {
    description: 'Labels created successfully (or partial success)',
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            contentType: { type: 'string', enum: ['application/pdf'] },
            byteLength: { type: 'integer' },
            pages: { type: 'integer' },
            orientation: { type: 'string', enum: ['portrait', 'landscape'] },
            metadata: {
              type: 'object',
              properties: {
                glsParcelId: { type: 'string' },
                clientReference: { type: 'string' },
                parcelNumber: { type: 'string' },
                pin: { type: 'string' },
              },
            },
          },
        },
      },
      results: {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'object',
              properties: {
                inputId: { type: 'string' },
                status: { type: 'string', enum: ['created'] },
                fileId: { type: 'string' },
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
      rawCarrierResponse: {
        description: 'PDF bytes in base64 (for dev display only - integrator should store)',
        type: 'string',
      },
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

export async function registerCreateLabelsRoute(
  fastify: FastifyInstance,
  adapter: GLSAdapter
) {
  fastify.post('/api/dev/gls/create-labels', {
    schema: {
      description: 'Create labels for multiple GLS parcels (dev endpoint for testing)',
      tags: ['GLS'],
      summary: 'Batch create labels for multiple parcels',
      body: {
        type: 'object',
        required: ['parcelCarrierIds', 'credentials'],
        properties: {
          parcelCarrierIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Array of GLS parcel IDs to create labels for (from CREATE_PARCELS)',
          },
          credentials: GLS_CREDENTIALS_SCHEMA,
           options: {
             type: 'object',
             description: 'Optional label generation options',
             properties: {
               country: {
                 type: 'string',
                 description: 'ISO 3166-1 alpha-2 country code (default: HU)',
               },
               useTestApi: {
                 type: 'boolean',
                 description: 'Use test API endpoint instead of production',
                 default: false,
               },
               printerType: {
                 type: 'string',
                 enum: ['A4_2x2', 'A4_4x1', 'Connect', 'Thermo', 'ThermoZPL', 'ShipItThermoPdf', 'ThermoZPL_300DPI'],
                 description: 'Printer type for label generation',
                 default: 'Thermo',
               },
             },
           },
        },
        examples: [
          {
            parcelCarrierIds: ['GLS-1001', 'GLS-1002', 'GLS-1003'],
            credentials: {
              username: 'integration@example.com',
              password: 'myPassword123',
              clientNumberList: [12345],
            },
            options: { useTestApi: true, country: 'HU' },
          },
          {
            parcelCarrierIds: ['GLS-1001'],
            credentials: {
              username: 'integration@example.com',
              password: 'myPassword123',
              clientNumberList: [12345],
              webshopEngine: 'shopickup-adapter/1.0',
            },
            options: { useTestApi: false, country: 'HU', printerType: 'A4_2x2' },
          },
        ],
      },
      response: BATCH_LABEL_RESPONSE_SCHEMA,
    },
    async handler(request: any, reply: any) {
      try {
        const { parcelCarrierIds, credentials, options } = request.body as any;

        const createReq: CreateLabelsRequest = {
          parcelCarrierIds,
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
          operationName: 'createLabels',
          loggingOptions: {
            // Log normally for label operations
            silentOperations: [],
            maxArrayItems: 50,
            maxDepth: 3,
            logRawResponse: 'summary',
            logMetadata: true,
          },
        };

        // Call adapter
        const labelResponse = await adapter.createLabels(createReq, ctx);

        // Convert PDF bytes to base64 for JSON response (for dev display only)
        if (labelResponse.rawCarrierResponse && Buffer.isBuffer(labelResponse.rawCarrierResponse)) {
          labelResponse.rawCarrierResponse = labelResponse.rawCarrierResponse.toString('base64');
        }

        // Determine HTTP status based on results
        const statusCode =
          labelResponse.allSucceeded ? 200 :
          labelResponse.allFailed ? 400 :
          labelResponse.someFailed ? 207 : // Multi-status for partial success
          200;

        return reply.status(statusCode).send(labelResponse);
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof CarrierError) {
          // Map carrier error categories to HTTP status codes
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
