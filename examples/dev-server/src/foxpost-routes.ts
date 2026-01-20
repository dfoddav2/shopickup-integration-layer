import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { CarrierError, type AdapterContext, type CreateParcelRequest, type Shipment, type Parcel } from '@shopickup/core';
import { httpClient } from './http-client.js';

/**
 * Register Foxpost dev endpoints for testing the adapter
 * These endpoints allow manual testing via Swagger UI
 */
export async function registerFoxpostRoutes(fastify: FastifyInstance) {
  const adapter = new FoxpostAdapter();

  /**
   * POST /api/dev/foxpost/create-parcel
   * Create a parcel in Foxpost (with optional test mode)
   * 
   * This endpoint exercises the Foxpost adapter's createParcel method.
   * You can toggle between production and test APIs using the options.useTestApi flag.
   */
  fastify.post('/api/dev/foxpost/create-parcel', {
    schema: {
      description: 'Create a Foxpost parcel (dev endpoint for testing)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Create a parcel in Foxpost',
      body: {
        type: 'object',
        required: ['shipment', 'parcel', 'credentials'],
        properties: {
          shipment: {
            type: 'object',
            description: 'Canonical shipment object',
            required: ['id', 'sender', 'recipient', 'service', 'totalWeight'],
            properties: {
              id: { type: 'string', description: 'Unique shipment ID' },
              sender: {
                type: 'object',
                description: 'Sender address',
                required: ['name', 'street', 'city', 'postalCode', 'country'],
                properties: {
                  name: { type: 'string' },
                  street: { type: 'string' },
                  city: { type: 'string' },
                  postalCode: { type: 'string' },
                  country: { type: 'string' },
                  phone: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                }
              },
              recipient: {
                type: 'object',
                description: 'Recipient address',
                required: ['name', 'street', 'city', 'postalCode', 'country'],
                properties: {
                  name: { type: 'string' },
                  street: { type: 'string' },
                  city: { type: 'string' },
                  postalCode: { type: 'string' },
                  country: { type: 'string' },
                  phone: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                }
              },
              service: { type: 'string', description: 'Service type (e.g., "standard", "express")' },
              totalWeight: { type: 'number', description: 'Total weight in grams' },
              reference: { type: 'string', description: 'Optional reference/order number' },
            }
          },
          parcel: {
            type: 'object',
            description: 'Canonical parcel object',
            required: ['id', 'shipmentId', 'weight'],
            properties: {
              id: { type: 'string', description: 'Unique parcel ID' },
              shipmentId: { type: 'string', description: 'Parent shipment ID' },
              weight: { type: 'number', description: 'Parcel weight in grams' },
              dimensions: {
                type: 'object',
                description: 'Parcel dimensions in cm',
                properties: {
                  length: { type: 'number' },
                  width: { type: 'number' },
                  height: { type: 'number' },
                }
              },
              status: { type: 'string', enum: ['draft', 'pending', 'ready'] },
            }
          },
          credentials: {
            type: 'object',
            description: 'Carrier credentials',
            required: ['apiKey'],
            properties: {
              apiKey: { type: 'string', description: 'Foxpost API key' }
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
          description: 'Server error (carrier API error)',
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
    }
  }, async (request, reply) => {
    const body = request.body as any;

    // Log request (without sensitive credentials)
    fastify.log.info({
      endpoint: '/api/dev/foxpost/create-parcel',
      shipmentId: body.shipment?.id,
      parcelId: body.parcel?.id,
      useTestApi: body.options?.useTestApi ?? false,
      hasCredentials: !!body.credentials?.apiKey
    }, 'Foxpost createParcel request');

    try {
      // Validate required fields
      if (!body.shipment || typeof body.shipment !== 'object') {
        return reply.code(400).send({ message: 'Missing or invalid shipment', category: 'Validation' });
      }
      if (!body.parcel || typeof body.parcel !== 'object') {
        return reply.code(400).send({ message: 'Missing or invalid parcel', category: 'Validation' });
      }
      if (!body.credentials?.apiKey) {
        return reply.code(400).send({ message: 'Missing credentials.apiKey', category: 'Validation' });
      }

      // Build CreateParcelRequest
      const req: CreateParcelRequest = {
        shipment: body.shipment as Shipment,
        parcel: body.parcel as Parcel,
        credentials: body.credentials,
        options: body.options
      };

      // Build AdapterContext with httpClient and logger
      const ctx: AdapterContext = {
        http: httpClient as any, // Cast to any to satisfy HttpClient interface
        logger: fastify.log
      };

      // Call adapter
      fastify.log.debug({
        shipmentId: body.shipment.id,
        testMode: body.options?.useTestApi ?? false
      }, 'Calling FoxpostAdapter.createParcel');

      const result = await adapter.createParcel!(body.shipment.id, req, ctx);

      // Log success
      fastify.log.info({
        shipmentId: body.shipment.id,
        carrierId: result.carrierId,
        status: result.status
      }, 'Parcel created successfully');

      return reply.code(200).send(result);
    } catch (err) {
      fastify.log.error(err, 'Error in createParcel');

      // Handle CarrierError
      if (err instanceof CarrierError) {
        const statusCode = err.category === 'Validation' ? 400
                         : err.category === 'Auth' ? 401
                         : err.category === 'RateLimit' ? 429
                         : 502;

        fastify.log.warn({
          message: err.message,
          category: err.category,
          statusCode
        }, 'CarrierError');

        return reply.code(statusCode).send({
          message: err.message,
          category: err.category
        });
      }

      // Handle unexpected errors
      if (err instanceof Error) {
        fastify.log.error({
          message: err.message,
          stack: err.stack
        }, 'Unexpected error');

        return reply.code(500).send({
          message: 'Internal server error: ' + err.message
        });
      }

      return reply.code(500).send({
        message: 'Internal server error'
      });
    }
  });

  fastify.log.info('Registered Foxpost dev routes');
}
