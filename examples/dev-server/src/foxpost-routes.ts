import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { safeValidateCreateParcelRequest, safeValidateCreateParcelsRequest } from '@shopickup/adapters-foxpost/validation';
import { CarrierError, type AdapterContext, type CreateParcelRequest, type CreateParcelsRequest, type Parcel } from '@shopickup/core';

// httpClient will be provided via fastify.decorate; create it in server.ts and attach to fastify

/**
 * Example data for testing
 */
const EXAMPLE_ADDRESS = {
  name: 'John Doe',
  street: '123 Main Street',
  city: 'Budapest',
  postalCode: '1011',
  country: 'HU',
  phone: '+36 1 234 5678',
  email: 'john@example.com'
};

const EXAMPLE_PARCEL: Parcel = {
  id: 'parcel-001',
  sender: EXAMPLE_ADDRESS,
  recipient: {
    name: 'Jane Smith',
    street: '456 Oak Avenue',
    city: 'Debrecen',
    postalCode: '4024',
    country: 'HU',
    phone: '+36 52 123 4567',
    email: 'jane@example.com'
  },
  weight: 1500, // grams
  service: 'standard',
  reference: 'ORD-2024-001',
  status: 'draft'
};

const EXAMPLE_CREDENTIALS = {
  apiKey: 'test-api-key-123456'
};

export async function registerFoxpostRoutes(fastify: FastifyInstance) {
  const adapter = new FoxpostAdapter();

  // Single-item create parcel endpoint
  (fastify.post as any)('/api/dev/foxpost/create-parcel', {
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
            description: 'Canonical parcel object with complete shipping details',
            required: ['id', 'sender', 'recipient', 'weight', 'service'],
            properties: {
              id: {
                type: 'string',
                description: 'Unique parcel ID'
              },
              sender: {
                type: 'object',
                description: 'Sender/shipper address',
                required: ['name', 'street', 'city', 'postalCode', 'country'],
                properties: {
                  name: { type: 'string' },
                  street: { type: 'string' },
                  city: { type: 'string' },
                  postalCode: { type: 'string' },
                  country: { type: 'string', description: 'ISO 3166-1 alpha-2' },
                  phone: { type: 'string' },
                  email: { type: 'string', format: 'email' }
                }
              },
              recipient: {
                type: 'object',
                description: 'Recipient/destination address',
                required: ['name', 'street', 'city', 'postalCode', 'country'],
                properties: {
                  name: { type: 'string' },
                  street: { type: 'string' },
                  city: { type: 'string' },
                  postalCode: { type: 'string' },
                  country: { type: 'string', description: 'ISO 3166-1 alpha-2' },
                  phone: { type: 'string' },
                  email: { type: 'string', format: 'email' }
                }
              },
              weight: {
                type: 'number',
                description: 'Parcel weight in grams'
              },
              service: {
                type: 'string',
                description: 'Shipping service type',
                enum: ['standard', 'express', 'economy', 'overnight']
              },
              reference: {
                type: 'string',
                description: 'Optional customer reference or order number'
              },
              status: {
                type: 'string',
                description: 'Parcel status',
                enum: ['draft', 'created', 'closed', 'label_generated', 'shipped', 'delivered', 'exception']
              }
            }
          },
           credentials: {
             type: 'object',
             description: 'Foxpost-specific carrier credentials (supports API key or basic auth)',
             properties: {
               apiKey: {
                 type: 'string',
                 description: 'Foxpost API key for authentication (alternative to basicUsername/basicPassword)'
               },
               basicUsername: {
                 type: 'string',
                 description: 'Username for basic authentication (requires basicPassword)'
               },
               basicPassword: {
                 type: 'string',
                 description: 'Password for basic authentication (requires basicUsername)'
               },
               username: {
                 type: 'string',
                 description: 'Alternative username field (legacy, equivalent to basicUsername)'
               },
               password: {
                 type: 'string',
                 description: 'Alternative password field (legacy, equivalent to basicPassword)'
               }
             }
           },
          options: {
            type: 'object',
            description: 'Optional request options',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API endpoint instead of production',
                default: false
              }
            }
          }
        }
      },
      response: {
        200: {
          description: 'Successful parcel creation',
          type: 'object',
          properties: {
            carrierId: { type: 'string', description: 'Barcode/ID from carrier' },
            status: { type: 'string', enum: ['created', 'pending', 'failed'] },
            labelUrl: { type: ['string', 'null'], description: 'Optional label URL' },
            raw: { type: 'object', description: 'Raw carrier response' }
          }
        },
        400: {
          description: 'Validation error (bad request)',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' }
          }
        },
        401: {
          description: 'Authentication error (invalid credentials)',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' }
          }
        },
        429: {
          description: 'Rate limit exceeded',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' }
          }
        },
        502: {
          description: 'Bad Gateway (carrier API error)',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' }
          }
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
    examples: [
      {
        summary: 'Create parcel with minimal data',
        value: {
          parcel: {
            id: 'parcel-001',
            sender: {
              name: 'John Doe',
              street: '123 Main Street',
              city: 'Budapest',
              postalCode: '1011',
              country: 'HU'
            },
            recipient: {
              name: 'Jane Smith',
              street: '456 Oak Avenue',
              city: 'Debrecen',
              postalCode: '4024',
              country: 'HU'
            },
            weight: 1500,
            service: 'standard'
          },
          credentials: {
            apiKey: 'test-api-key-123456'
          }
        }
      },
       {
         summary: 'Create parcel with full details',
         value: {
           parcel: EXAMPLE_PARCEL,
           credentials: EXAMPLE_CREDENTIALS,
           options: { useTestApi: false }
         }
       },
       {
         summary: 'Create parcel with basic auth credentials',
         value: {
           parcel: {
             id: 'parcel-003',
             sender: {
               name: 'John Doe',
               street: '123 Main Street',
               city: 'Budapest',
               postalCode: '1011',
               country: 'HU'
             },
             recipient: {
               name: 'Alice Wong',
               street: '321 Elm Street',
               city: 'Budapest',
               postalCode: '1053',
               country: 'HU'
             },
             weight: 800,
             service: 'standard'
           },
           credentials: {
             basicUsername: 'myuser@example.com',
             basicPassword: 'mypassword123'
           },
           options: { useTestApi: true }
         }
       }
     ]
  }, async (request: any, reply: any) => {
    const body = request.body as any;

    fastify.log.info({ endpoint: '/api/dev/foxpost/create-parcel', parcelId: body?.parcel?.id }, 'Foxpost createParcel request');

    try {
      // Validate request with zod schema
      const validated = safeValidateCreateParcelRequest(body);
      if (!validated.success) {
        fastify.log.warn({ errors: validated.error.flatten() }, 'Validation failed for createParcel');
        return (reply as any).code(400).send({ 
          message: validated.error.message,
          category: 'Validation',
          errors: validated.error.flatten()
        });
      }

      const req: CreateParcelRequest = validated.data;
      const ctx: AdapterContext = { http: (fastify as any).httpClient as any, logger: fastify.log };

      const result = await adapter.createParcel!(req, ctx);

      return reply.send(result);
    } catch (err) {
      fastify.log.error(err, 'Error in createParcel');
      if (err instanceof CarrierError) {
        return (reply as any).code(502).send({ message: err.message, category: err.category });
      }
      return (reply as any).code(500).send({ message: 'Internal server error' });
    }
  });

  // Batch create endpoint
  (fastify.post as any)('/api/dev/foxpost/create-parcels', {
    schema: {
      description: 'Create multiple Foxpost parcels in a single batch request',
      tags: ['Foxpost', 'Dev'],
      summary: 'Batch create multiple parcels in Foxpost',
      body: {
        type: 'object',
        required: ['parcels', 'credentials'],
        properties: {
          parcels: {
            type: 'array',
            description: 'Array of parcels to create',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'sender', 'recipient', 'weight', 'service'],
              properties: {
                id: {
                  type: 'string',
                  description: 'Unique parcel ID'
                },
                sender: {
                  type: 'object',
                  description: 'Sender/shipper address',
                  required: ['name', 'street', 'city', 'postalCode', 'country'],
                  properties: {
                    name: { type: 'string' },
                    street: { type: 'string' },
                    city: { type: 'string' },
                    postalCode: { type: 'string' },
                    country: { type: 'string', description: 'ISO 3166-1 alpha-2' },
                    phone: { type: 'string' },
                    email: { type: 'string', format: 'email' }
                  }
                },
                recipient: {
                  type: 'object',
                  description: 'Recipient/destination address',
                  required: ['name', 'street', 'city', 'postalCode', 'country'],
                  properties: {
                    name: { type: 'string' },
                    street: { type: 'string' },
                    city: { type: 'string' },
                    postalCode: { type: 'string' },
                    country: { type: 'string', description: 'ISO 3166-1 alpha-2' },
                    phone: { type: 'string' },
                    email: { type: 'string', format: 'email' }
                  }
                },
                weight: {
                  type: 'number',
                  description: 'Parcel weight in grams'
                },
                service: {
                  type: 'string',
                  description: 'Shipping service type',
                  enum: ['standard', 'express', 'economy', 'overnight']
                },
                reference: {
                  type: 'string',
                  description: 'Optional customer reference or order number'
                },
                status: {
                   type: 'string',
                   description: 'Parcel status',
                   enum: ['draft', 'created', 'closed', 'label_generated', 'shipped', 'delivered', 'exception']
                }
              }
            }
          },
           credentials: {
             type: 'object',
             description: 'Shared carrier credentials for all parcels (supports API key or basic auth)',
             properties: {
               apiKey: {
                 type: 'string',
                 description: 'Foxpost API key for authentication (alternative to basicUsername/basicPassword)'
               },
               basicUsername: {
                 type: 'string',
                 description: 'Username for basic authentication (requires basicPassword)'
               },
               basicPassword: {
                 type: 'string',
                 description: 'Password for basic authentication (requires basicUsername)'
               },
               username: {
                 type: 'string',
                 description: 'Alternative username field (legacy, equivalent to basicUsername)'
               },
               password: {
                 type: 'string',
                 description: 'Alternative password field (legacy, equivalent to basicPassword)'
               }
             }
           },
          options: {
            type: 'object',
            description: 'Optional request options applied to all parcels',
            properties: {
              useTestApi: {
                type: 'boolean',
                description: 'Use test/sandbox API endpoint instead of production',
                default: false
              }
            }
          }
        }
      },
      response: {
        200: {
          description: 'Array of parcel creation results (per-item responses)',
          type: 'array',
          items: {
            type: 'object',
            properties: {
              carrierId: { type: ['string', 'null'], description: 'Barcode/ID from carrier or null if failed' },
              status: { type: 'string', enum: ['created', 'pending', 'failed'] },
              labelUrl: { type: ['string', 'null'], description: 'Optional label URL' },
              raw: { type: 'object', description: 'Raw carrier response or error details' }
            }
          }
        },
        400: {
          description: 'Validation error (bad request)',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' }
          }
        },
        401: {
          description: 'Authentication error (invalid credentials)',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' }
          }
        },
        429: {
          description: 'Rate limit exceeded',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' }
          }
        },
        502: {
          description: 'Bad Gateway (carrier API error)',
          type: 'object',
          properties: {
            message: { type: 'string' },
            category: { type: 'string' }
          }
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    },
     examples: [
       {
         summary: 'Create two parcels in batch',
         value: {
           parcels: [
             {
               id: 'parcel-001',
               sender: EXAMPLE_ADDRESS,
               recipient: {
                 name: 'Jane Smith',
                 street: '456 Oak Avenue',
                 city: 'Debrecen',
                 postalCode: '4024',
                 country: 'HU'
               },
               weight: 1500,
               service: 'standard',
               reference: 'ORD-2024-001'
             },
             {
               id: 'parcel-002',
               sender: EXAMPLE_ADDRESS,
               recipient: {
                 name: 'Bob Johnson',
                 street: '789 Pine Road',
                 city: 'Szeged',
                 postalCode: '6720',
                 country: 'HU'
               },
               weight: 2000,
               service: 'express',
               reference: 'ORD-2024-002'
             }
           ],
           credentials: EXAMPLE_CREDENTIALS,
           options: { useTestApi: false }
         }
       },
       {
         summary: 'Create parcel with basic auth credentials',
         value: {
           parcels: [
             {
               id: 'parcel-003',
               sender: EXAMPLE_ADDRESS,
               recipient: {
                 name: 'Alice Wong',
                 street: '321 Elm Street',
                 city: 'Budapest',
                 postalCode: '1053',
                 country: 'HU'
               },
               weight: 800,
               service: 'standard'
             }
           ],
           credentials: {
             basicUsername: 'myuser@example.com',
             basicPassword: 'mypassword123'
           },
           options: { useTestApi: true }
         }
       }
     ]
  }, async (request: any, reply: any) => {
    const body = request.body as any;

    fastify.log.info({ endpoint: '/api/dev/foxpost/create-parcels', itemCount: body?.parcels?.length ?? 0 }, 'Foxpost createParcels request');

    try {
      // Validate request with zod schema
      const validated = safeValidateCreateParcelsRequest(body);
      if (!validated.success) {
        fastify.log.warn({ errors: validated.error.flatten() }, 'Validation failed for createParcels');
        return (reply as any).code(400).send({ 
          message: validated.error.message,
          category: 'Validation',
          errors: validated.error.flatten()
        });
      }

      const parcelsReq: CreateParcelsRequest = validated.data;
      const ctx: AdapterContext = { http: (fastify as any).httpClient as any, logger: fastify.log };

      if (!(adapter as any).createParcels) {
        // Fallback: call createParcel for each item if batch not available
        const results: any[] = [];
        for (const p of parcelsReq.parcels) {
          try {
            const req: CreateParcelRequest = {
              parcel: p,
              credentials: parcelsReq.credentials,
              options: parcelsReq.options,
            };
            const res = adapter.createParcel ? await adapter.createParcel(req, ctx) : null;
            results.push(res);
          } catch (err) {
            if (err instanceof CarrierError) {
              results.push({ carrierId: null, status: 'failed', raw: { message: err.message, category: err.category } });
            } else {
              results.push({ carrierId: null, status: 'failed', raw: { message: String(err) } });
            }
          }
        }
        return reply.send(results);
      }

      const results = await (adapter as any).createParcels(parcelsReq, ctx);
      return reply.send(results);
    } catch (err) {
      fastify.log.error(err, 'Error in createParcels');
      if (err instanceof CarrierError) {
        return (reply as any).code(502).send({ message: err.message, category: err.category });
      }
      return (reply as any).code(500).send({ message: 'Internal server error' });
    }
  });

  fastify.log.info('Registered Foxpost dev routes');
}

declare module 'fastify' {
  interface FastifyInstance {
    httpClient?: any;
  }
}
