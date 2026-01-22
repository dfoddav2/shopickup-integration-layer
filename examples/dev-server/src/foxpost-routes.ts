import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { safeValidateCreateParcelRequest, safeValidateCreateParcelsRequest, FoxpostCredentials } from '@shopickup/adapters-foxpost/validation';
import { CarrierError, type AdapterContext, type CreateParcelRequest, type CreateParcelsRequest, type Parcel } from '@shopickup/core';

/**
 * Example Parcel objects using the new Parcel structure
 */
const EXAMPLE_PARCEL_HOME_DELIVERY: Parcel = {
  id: 'csomag-001',
  shipper: {
    contact: {
      name: 'Shopickup Ltd.',
      phone: '+36203456789',
      email: 'shipping@shopickup.hu',
    },
    address: {
      name: 'Shopickup Ltd.',
      street: 'Kossuth Lajos utca 12',
      city: 'Budapest',
      postalCode: '1053',
      country: 'HU',
      phone: '+36203456789',
      email: 'shipping@shopickup.hu',
    },
  },
  recipient: {
    contact: {
      name: 'Nagy Erzsébet',
      phone: '+36307654321',
      email: 'erzsebet.nagy@example.hu',
    },
    delivery: {
      method: 'HOME' as const,
      address: {
        name: 'Nagy Erzsébet',
        street: 'Petőfi Sándor utca 45',
        city: 'Debrecen',
        postalCode: '4024',
        country: 'HU',
        phone: '+36307654321',
        email: 'erzsebet.nagy@example.hu',
      },
    },
  },
  package: {
    weightGrams: 1500,
  },
  service: 'standard',
  references: {
    customerReference: 'RND-2026-001',
  },
  status: 'draft',
  handling: {
    fragile: false,
  },
};

const EXAMPLE_PARCEL_APM_DELIVERY: Parcel = {
  id: 'csomag-002',
  shipper: {
    contact: {
      name: 'Shopickup Ltd.',
      phone: '+36203456789',
      email: 'shipping@shopickup.hu',
    },
    address: {
      name: 'Shopickup Ltd.',
      street: 'Kossuth Lajos utca 12',
      city: 'Budapest',
      postalCode: '1053',
      country: 'HU',
      phone: '+36203456789',
      email: 'shipping@shopickup.hu',
    },
  },
  recipient: {
    contact: {
      name: 'John Doe',
      phone: '+36301111111',
      email: 'john@example.hu',
    },
    delivery: {
      method: 'PICKUP_POINT' as const,
      pickupPoint: {
        id: 'bp-01',
        provider: 'foxpost',
        name: 'Foxpost - Blaha Lujza tér',
        address: {
          name: 'Foxpost',
          street: 'Blaha Lujza tér 1',
          city: 'Budapest',
          postalCode: '1085',
          country: 'HU',
        },
        type: 'LOCKER',
      },
      instructions: 'Place in locker A5',
    },
  },
  package: {
    weightGrams: 1000,
  },
  service: 'standard',
  references: {
    customerReference: 'RND-2026-002',
  },
  status: 'draft',
};

const EXAMPLE_CREDENTIALS: FoxpostCredentials = {
  apiKey: 'test-api-key-123456',
  basicUsername: 'myuser@example.com',
  basicPassword: 'mypassword123',
};

export async function registerFoxpostRoutes(fastify: FastifyInstance) {
  const adapter = new FoxpostAdapter();

  // Single-item create parcel endpoint
  fastify.post('/api/dev/foxpost/create-parcel', {
    schema: {
      description: 'Create a Foxpost parcel (dev endpoint for testing)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Create a single parcel in Foxpost',
      body: {
        type: 'object',
        required: ['parcel', 'credentials'],
        properties: {
          parcel: {
            type: 'object',
            description: 'Canonical parcel with complete shipping details (shipper + recipient)',
          },
          credentials: {
            type: 'object',
            description: 'Foxpost-specific carrier credentials',
            required: ['apiKey', 'basicUsername', 'basicPassword'],
            properties: {
              apiKey: { type: 'string' },
              basicUsername: { type: 'string' },
              basicPassword: { type: 'string' },
            },
          },
          options: {
            type: 'object',
            description: 'Optional request options',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API endpoint',
                default: false,
              },
            },
          },
        },
        examples: [
          {
            parcel: EXAMPLE_PARCEL_HOME_DELIVERY,
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true },
          },
          {
            parcel: EXAMPLE_PARCEL_APM_DELIVERY,
            credentials: EXAMPLE_CREDENTIALS,
            options: { useTestApi: true },
          },
        ],
      },
      response: {
         200: {
           description: 'Successful parcel creation',
           type: 'object',
           additionalProperties: false,
           properties: {
             carrierId: { type: 'string' },
             status: { type: 'string' },
             labelUrl: { type: ['string', 'null'] },
             raw: { 
               type: 'object',
               additionalProperties: true,  // Allow any properties in raw
             },
           },
         },
         400: {
           description: 'Validation error or client error',
           type: 'object',
           properties: {
             message: { type: 'string' },
             category: { type: 'string' },
             raw: { type: 'object' },
           },
         },
         401: {
           description: 'Authentication error - invalid carrier credentials',
           type: 'object',
           properties: {
             message: { 
               type: 'string',
               example: 'Foxpost credentials invalid'
             },
             category: { 
               type: 'string',
               example: 'Auth'
             },
             carrierCode: {
               type: 'string',
               example: 'WRONG_USERNAME_OR_PASSWORD'
             },
             raw: { 
               type: 'object',
               properties: {
                 timestamp: { type: 'string' },
                 error: { type: 'string' },
                 status: { type: 'number' }
               }
             },
           },
         },
       },
    },
    async handler(request: any, reply: any) {
      try {
        const { parcel, credentials, options } = request.body as any;

        const createReq: CreateParcelRequest = {
          parcel,
          credentials,
          options,
        };

        // Validate the request
        const validated = safeValidateCreateParcelRequest(createReq);
        if (!validated.success) {
          return reply.status(400).send({
            message: `Validation error: ${validated.error.message}`,
            category: 'Validation',
            errors: validated.error.issues,
          });
        }

        // Call adapter
        const httpClient = (fastify as any).httpClient;
        if (!httpClient) {
          return reply.status(500).send({
            message: 'HTTP client not configured',
            category: 'Internal',
          });
        }

         const ctx: AdapterContext = {
           http: httpClient,
           logger: fastify.log,
         };

          const result = await adapter.createParcel!(createReq, ctx);
          return reply.status(200).send(result);
       } catch (error) {
         fastify.log.error(error);

         if (error instanceof CarrierError) {
           // Map carrier error categories to HTTP status codes
           const statusCode = error.category === 'Auth' ? 401 : 400;
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

  // Batch create parcels endpoint
  fastify.post('/api/dev/foxpost/create-parcels', {
    schema: {
      description: 'Create multiple Foxpost parcels in one call (dev endpoint)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Create multiple parcels in batch',
      body: {
        type: 'object',
        required: ['parcels', 'credentials'],
        properties: {
          parcels: {
            type: 'array',
            description: 'Array of canonical parcels',
            minItems: 1,
          },
          credentials: {
            type: 'object',
            description: 'Foxpost credentials (shared for batch)',
          },
          options: {
            type: 'object',
            description: 'Optional request options',
          },
        },
      },
       response: {
         200: {
           description: 'Per-item results (array of CarrierResource)',
           type: 'array',
           items: {
             type: 'object',
             properties: {
               carrierId: { type: 'string' },
               status: { type: 'string' },
               raw: { 
                 type: 'object',
                 additionalProperties: true,  // Allow any properties in raw
               },
             },
           },
         },
         400: {
           description: 'Validation error or client error',
           type: 'object',
           properties: {
             message: { type: 'string' },
             category: { type: 'string' },
           },
         },
         401: {
           description: 'Authentication error - invalid carrier credentials',
           type: 'object',
           properties: {
             message: { type: 'string' },
             category: { type: 'string' },
             carrierCode: { type: 'string' },
           },
         },
       },
    },
    async handler(request: any, reply: any) {
      try {
        const { parcels, credentials, options } = request.body as any;

        const createReq: CreateParcelsRequest = {
          parcels,
          credentials,
          options,
        };

        // Validate the request
        const validated = safeValidateCreateParcelsRequest(createReq);
        if (!validated.success) {
          return reply.status(400).send({
            message: `Validation error: ${validated.error.message}`,
            category: 'Validation',
            errors: validated.error.issues,
          });
        }

        // Call adapter
        const httpClient = (fastify as any).httpClient;
        if (!httpClient) {
          return reply.status(500).send({
            message: 'HTTP client not configured',
            category: 'Internal',
          });
        }

        const ctx: AdapterContext = {
          http: httpClient,
          logger: fastify.log,
        };

         const results = await adapter.createParcels!(createReq, ctx);
         return reply.status(200).send(results);
       } catch (error) {
         fastify.log.error(error);

         if (error instanceof CarrierError) {
           // Map carrier error categories to HTTP status codes
           const statusCode = error.category === 'Auth' ? 401 : 400;
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

  // Example parcels endpoint (GET)
  fastify.get('/api/dev/foxpost/examples', {
    schema: {
      description: 'Get example parcels for testing',
      tags: ['Foxpost', 'Dev'],
      response: {
        200: {
          description: 'Example parcels and credentials',
          type: 'object',
          properties: {
            homeDelivery: { type: 'object' },
            apmDelivery: { type: 'object' },
            credentials: { type: 'object' },
          },
        },
      },
    },
    async handler(request: any, reply: any) {
      return reply.status(200).send({
        homeDelivery: EXAMPLE_PARCEL_HOME_DELIVERY,
        apmDelivery: EXAMPLE_PARCEL_APM_DELIVERY,
        credentials: EXAMPLE_CREDENTIALS,
      });
    },
  });
}
