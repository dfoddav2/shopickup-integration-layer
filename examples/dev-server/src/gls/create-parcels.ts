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

const ADDRESS_SCHEMA = {
  type: 'object',
  required: ['name', 'street', 'city', 'postalCode', 'country'],
  properties: {
    name: { type: 'string', description: 'Person or company name' },
    street: { type: 'string', description: 'Street address' },
    city: { type: 'string' },
    postalCode: { type: 'string' },
    country: { type: 'string', pattern: '^[A-Z]{2}$', description: 'ISO 3166-1 alpha-2 country code' },
    phone: { type: 'string' },
    email: { type: 'string', format: 'email' },
    company: { type: 'string' },
    province: { type: 'string' },
    isPoBox: { type: 'boolean' },
  },
};

const CONTACT_SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string' },
    phone: { type: 'string' },
    email: { type: 'string', format: 'email' },
    company: { type: 'string' },
  },
};

const HOME_DELIVERY_SCHEMA = {
  type: 'object',
  required: ['method', 'address'],
  properties: {
    method: { type: 'string', enum: ['HOME'] },
    address: ADDRESS_SCHEMA,
    instructions: { type: 'string' },
  },
};

const PICKUP_POINT_DELIVERY_SCHEMA = {
  type: 'object',
  required: ['method', 'pickupPoint'],
  properties: {
    method: { type: 'string', enum: ['PICKUP_POINT'] },
    pickupPoint: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        provider: { type: 'string' },
        name: { type: 'string' },
        address: ADDRESS_SCHEMA,
        type: { type: 'string', enum: ['LOCKER', 'SHOP', 'POST_OFFICE', 'OTHER'] },
      },
    },
    instructions: { type: 'string' },
  },
};

const PARCEL_SCHEMA = {
  type: 'object',
  required: ['id', 'package', 'service', 'shipper', 'recipient'],
  properties: {
    id: {
      type: 'string',
      description: 'Unique order/reference identifier',
    },
    package: {
      type: 'object',
      required: ['weightGrams'],
      properties: {
        weightGrams: {
          type: 'integer',
          description: 'Weight in grams',
        },
        dimensionsCm: {
          type: 'object',
          properties: {
            length: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
        },
      },
    },
    service: {
      type: 'string',
      enum: ['standard', 'express', 'economy', 'overnight'],
      description: 'Normalized service level',
    },
    shipper: {
      type: 'object',
      required: ['contact', 'address'],
      properties: {
        contact: CONTACT_SCHEMA,
        address: ADDRESS_SCHEMA,
      },
    },
    recipient: {
      type: 'object',
      required: ['contact', 'delivery'],
      properties: {
        contact: CONTACT_SCHEMA,
        delivery: {
          oneOf: [HOME_DELIVERY_SCHEMA, PICKUP_POINT_DELIVERY_SCHEMA],
        },
      },
    },
    carrierServiceCode: { type: 'string' },
    handling: {
      type: 'object',
      properties: {
        fragile: { type: 'boolean' },
        perishables: { type: 'boolean' },
        batteries: { type: 'string', enum: ['NONE', 'LITHIUM_ION', 'LITHIUM_METAL'] },
      },
    },
    cod: {
      type: 'object',
      properties: {
        amount: {
          type: 'object',
          required: ['value', 'currency'],
          properties: {
            value: { type: 'number' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
          },
        },
        reference: { type: 'string' },
      },
    },
    references: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        customerReference: { type: 'string' },
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
      rawCarrierResponse: { type: 'object', additionalProperties: true },
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
                package: {
                  weightGrams: 1200,
                },
                service: 'standard',
                shipper: {
                  contact: {
                    name: 'Sender Company',
                    phone: '+36 1 234 5678',
                    email: 'sender@example.com',
                  },
                  address: {
                    name: 'Sender Company',
                    street: 'Main St 1',
                    city: 'Budapest',
                    postalCode: '1011',
                    country: 'HU',
                  },
                },
                recipient: {
                  contact: {
                    name: 'John Doe',
                    phone: '+36 66 123 4567',
                    email: 'john@example.com',
                  },
                  delivery: {
                    method: 'HOME',
                    address: {
                      name: 'John Doe',
                      street: 'Delivery St 42',
                      city: 'Szeged',
                      postalCode: '6720',
                      country: 'HU',
                    },
                  },
                },
              },
              {
                id: 'ORDER-2025-002',
                package: {
                  weightGrams: 800,
                },
                service: 'standard',
                shipper: {
                  contact: {
                    name: 'Sender Company',
                  },
                  address: {
                    name: 'Sender Company',
                    street: 'Main St 1',
                    city: 'Budapest',
                    postalCode: '1011',
                    country: 'HU',
                  },
                },
                recipient: {
                  contact: {
                    name: 'Jane Smith',
                  },
                  delivery: {
                    method: 'HOME',
                    address: {
                      name: 'Jane Smith',
                      street: 'Other St 99',
                      city: 'Debrecen',
                      postalCode: '4024',
                      country: 'HU',
                    },
                  },
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

        const responseBody: any = {
          results: parcelResponse.results,
          successCount: parcelResponse.successCount,
          failureCount: parcelResponse.failureCount,
          totalCount: parcelResponse.totalCount,
          allSucceeded: parcelResponse.allSucceeded,
          allFailed: parcelResponse.allFailed,
          someFailed: parcelResponse.someFailed,
          summary: parcelResponse.summary,
        };

        if (parcelResponse.rawCarrierResponse) {
          responseBody.rawCarrierResponse = parcelResponse.rawCarrierResponse;
        }

        return reply.status(statusCode).send(responseBody);
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
