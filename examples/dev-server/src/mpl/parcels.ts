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
  EXAMPLE_MPL_CREDENTIALS_OAUTH,
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
        customerReference: { type: 'string' },
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
            credentials: EXAMPLE_MPL_CREDENTIALS_OAUTH,
            parcels: [
              // Example 1: Home delivery, standard service
              {
                id: 'WEBSHOP-2025-001',
                shipper: {
                  contact: { name: 'TechStore Budapest', phone: '+36201234567', email: 'logistics@techstore.hu' },
                  address: {
                    name: 'TechStore Budapest Logisztika',
                    street: 'Puskás Tivadar utca 15',
                    city: 'Budapest',
                    postalCode: '1142',
                    country: 'HU',
                  },
                },
                recipient: {
                  contact: { name: 'Kovács János', phone: '+36309876543', email: 'janos.kovacs@email.hu' },
                  delivery: {
                    method: 'HOME',
                    address: {
                      name: 'Kovács János',
                      street: 'Arany János utca 23',
                      city: 'Debrecen',
                      postalCode: '4026',
                      country: 'HU',
                    },
                  },
                },
                service: 'standard',
                package: { 
                  weightGrams: 850,
                  dimensionsCm: { length: 30, width: 20, height: 10 },
                },
                references: {
                  orderId: 'WEB-2025-001',
                  customerReference: 'KOVJANOS-2025',
                },
              },
              // Example 2: Pickup point delivery with COD
              {
                id: 'WEBSHOP-2025-002',
                shipper: {
                  contact: { name: 'TechStore Budapest', phone: '+36201234567', email: 'logistics@techstore.hu' },
                  address: {
                    name: 'TechStore Budapest Logisztika',
                    street: 'Puskás Tivadar utca 15',
                    city: 'Budapest',
                    postalCode: '1142',
                    country: 'HU',
                  },
                },
                recipient: {
                  contact: { name: 'Nagy Péter', phone: '+36201234567', email: 'peter.nagy@email.hu' },
                  delivery: {
                    method: 'PICKUP_POINT',
                    pickupPoint: {
                      id: '1053-CSOMAGPONT',
                      name: 'Maszka Jelmezbolt - Parcel Shop',
                      address: {
                        street: 'Irányi utca 20',
                        city: 'Budapest',
                        postalCode: '1053',
                        country: 'HU',
                      },
                    },
                  },
                },
                service: 'standard',
                package: { 
                  weightGrams: 1200,
                  dimensionsCm: { length: 25, width: 25, height: 15 },
                },
                references: {
                  orderId: 'WEB-2025-002',
                  customerReference: 'NAGYPETER-2025',
                },
                cod: {
                  amount: {
                    amount: 15999,
                    currency: 'HUF',
                  },
                },
              },
              // Example 3: Express service, home delivery (next-day)
              {
                id: 'WEBSHOP-2025-003',
                shipper: {
                  contact: { name: 'TechStore Budapest', phone: '+36201234567', email: 'logistics@techstore.hu' },
                  address: {
                    name: 'TechStore Budapest Logisztika',
                    street: 'Puskás Tivadar utca 15',
                    city: 'Budapest',
                    postalCode: '1142',
                    country: 'HU',
                  },
                },
                recipient: {
                  contact: { name: 'Tóth Mária', phone: '+36309876543', email: 'maria.toth@email.hu' },
                  delivery: {
                    method: 'HOME',
                    address: {
                      name: 'Tóth Mária',
                      street: 'Andrássy út 89',
                      city: 'Budapest',
                      postalCode: '1062',
                      country: 'HU',
                    },
                  },
                },
                service: 'express',
                carrierServiceCode: 'MPLEX',
                package: { 
                  weightGrams: 500,
                  dimensionsCm: { length: 20, width: 15, height: 8 },
                },
                references: {
                  orderId: 'WEB-2025-003',
                  customerReference: 'TOTHMARIA-EXPRESS',
                },
              },
              // Example 4: Economy service with declared value (for customs/insurance)
              {
                id: 'WEBSHOP-2025-004',
                shipper: {
                  contact: { name: 'TechStore Budapest', phone: '+36201234567', email: 'logistics@techstore.hu' },
                  address: {
                    name: 'TechStore Budapest Logisztika',
                    street: 'Puskás Tivadar utca 15',
                    city: 'Budapest',
                    postalCode: '1142',
                    country: 'HU',
                  },
                },
                recipient: {
                  contact: { name: 'Szőcs Attila', phone: '+36201234567', email: 'attila.szocs@email.hu' },
                  delivery: {
                    method: 'HOME',
                    address: {
                      name: 'Szőcs Attila',
                      street: 'Hattyú utca 12',
                      city: 'Szeged',
                      postalCode: '6722',
                      country: 'HU',
                    },
                  },
                },
                service: 'economy',
                package: { 
                  weightGrams: 2500,
                  dimensionsCm: { length: 40, width: 30, height: 20 },
                },
                references: {
                  orderId: 'WEB-2025-004',
                  customerReference: 'SZOCS-ECONOMY',
                },
                declaredValue: {
                  amount: 45000,
                  currency: 'HUF',
                },
              },
              // Example 5: Pickup point + COD + larger package
              {
                id: 'WEBSHOP-2025-005',
                shipper: {
                  contact: { name: 'TechStore Budapest', phone: '+36201234567', email: 'logistics@techstore.hu' },
                  address: {
                    name: 'TechStore Budapest Logisztika',
                    street: 'Puskás Tivadar utca 15',
                    city: 'Budapest',
                    postalCode: '1142',
                    country: 'HU',
                  },
                },
                recipient: {
                  contact: { name: 'Balog Zoltán', phone: '+36201234567', email: 'zoltan.balog@email.hu' },
                  delivery: {
                    method: 'PICKUP_POINT',
                    pickupPoint: {
                      id: '1072-ALPHAZOOKF',
                      name: 'Alpha Zoo Dohány utca - Parcel Point',
                      address: {
                        street: 'Dohány utca 17',
                        city: 'Budapest',
                        postalCode: '1072',
                        country: 'HU',
                      },
                    },
                  },
                },
                service: 'standard',
                package: { 
                  weightGrams: 3800,
                  dimensionsCm: { length: 50, width: 35, height: 25 },
                },
                references: {
                  orderId: 'WEB-2025-005',
                  customerReference: 'BALOG-PP-COD',
                },
                cod: {
                  amount: {
                    amount: 24900,
                    currency: 'HUF',
                  },
                },
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
         examples: [
          {
            credentials: EXAMPLE_MPL_CREDENTIALS_OAUTH,
            parcel: {
              id: 'WEBSHOP-2025-SINGLE-001',
              shipper: {
                contact: { 
                  name: 'Fashion Store Budapest', 
                  phone: '+36203334444', 
                  email: 'orders@fashionstore.hu' 
                },
                address: {
                  name: 'Fashion Store Budapest Warehouse',
                  street: 'Expo utca 7',
                  city: 'Budapest',
                  postalCode: '1101',
                  country: 'HU',
                },
              },
              recipient: {
                contact: { 
                  name: 'Varga Zsuzsanna', 
                  phone: '+36301112222', 
                  email: 'zsuzsanna@email.hu' 
                },
                delivery: {
                  method: 'HOME',
                  address: {
                    name: 'Varga Zsuzsanna',
                    street: 'Erzsébet körút 18',
                    city: 'Budapest',
                    postalCode: '1073',
                    country: 'HU',
                  },
                },
              },
              service: 'standard',
              package: { 
                weightGrams: 650,
                dimensionsCm: { length: 25, width: 20, height: 10 },
              },
              references: {
                orderId: 'WEB-2025-SINGLE-001',
                customerReference: 'VARGA-FASHION',
              },
            },
            options: {
              useTestApi: false,
              accountingCode: 'ACC123456',
              labelType: 'A5',
            },
          },
          {
            credentials: EXAMPLE_MPL_CREDENTIALS_OAUTH,
            parcel: {
              id: 'WEBSHOP-2025-SINGLE-COD-PP',
              shipper: {
                contact: { 
                  name: 'Electronics Hub', 
                  phone: '+36209876543', 
                  email: 'shipping@electronicshu.hu' 
                },
                address: {
                  name: 'Electronics Hub Distribution',
                  street: 'Logisztika körút 12',
                  city: 'Debrecen',
                  postalCode: '4030',
                  country: 'HU',
                },
              },
              recipient: {
                contact: { 
                  name: 'Kiss László', 
                  phone: '+36306665555', 
                  email: 'laszlo@email.hu' 
                },
                delivery: {
                  method: 'PICKUP_POINT',
                  pickupPoint: {
                    id: '1066-CSOMAGPONT03',
                    name: 'Digitalpress - Parcel Shop',
                    address: {
                      street: 'Jókai utca 34',
                      city: 'Budapest',
                      postalCode: '1066',
                      country: 'HU',
                    },
                  },
                },
              },
              service: 'standard',
              package: { 
                weightGrams: 1500,
                dimensionsCm: { length: 30, width: 25, height: 15 },
              },
              references: {
                orderId: 'WEB-2025-SINGLE-COD-PP',
                customerReference: 'KISS-ELECTRONICS',
              },
              cod: {
                amount: {
                  amount: 22500,
                  currency: 'HUF',
                },
              },
            },
            options: {
              useTestApi: false,
              accountingCode: 'ACC123456',
              labelType: 'A5',
            },
          }
        ]
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
