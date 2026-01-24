/**
 * Foxpost routes - Common utilities, schemas, and examples
 * Shared across all Foxpost route handlers
 */

import type { Parcel } from '@shopickup/core';
import type { FoxpostCredentials } from '@shopickup/adapters-foxpost/validation';

/**
 * Common error response schema for authentication failures
 */
export const FOXPOST_AUTHENTICATION_ERROR_SCHEMA = {
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
};

/**
 * Foxpost credentials schema for OpenAPI documentation
 */
export const FOXPOST_CREDENTIALS_SCHEMA = {
  type: 'object',
  description: 'Foxpost credentials',
  properties: {
    apiKey: { type: 'string' },
    basicUsername: { type: 'string' },
    basicPassword: { type: 'string' },
  }
};

/**
 * Foxpost request options schema for OpenAPI documentation
 */
export const FOXPOST_OPTIONS_SCHEMA = {
  type: 'object',
  description: 'Optional request options',
  properties: {
    useTestApi: {
      type: 'boolean',
      description: 'Use test/sandbox API endpoint',
      default: true,
    },
  },
};

/**
 * Example: Parcel with HOME delivery
 * Uses the new Parcel structure with shipper + recipient
 */
export const EXAMPLE_PARCEL_HOME_DELIVERY: Parcel = {
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

/**
 * Example: Parcel with PICKUP_POINT delivery (APM/locker)
 */
export const EXAMPLE_PARCEL_APM_DELIVERY: Parcel = {
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

/**
 * Example: Foxpost credentials
 */
export const EXAMPLE_CREDENTIALS: FoxpostCredentials = {
  apiKey: 'test-api-key-123456',
  basicUsername: 'myuser@example.com',
  basicPassword: 'mypassword123',
};

/**
 * Common response schema properties for single parcel creation
 */
export const SINGLE_PARCEL_RESPONSE_SCHEMA = {
  200: {
    description: 'Successful parcel creation',
    type: 'object',
    properties: {
      carrierId: { type: 'string' },
      status: { type: 'string' },
      labelUrl: { type: ['string', 'null'] },
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
      raw: {
        type: 'object',
        additionalProperties: true,
      },
      rawCarrierResponse: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  400: {
    description: 'Validation error or client error',
    type: 'object',
    properties: {
      carrierId: { type: 'string' },
      status: { type: 'string', enum: ['failed'] },
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
      raw: {
        type: 'object',
        additionalProperties: true,
      },
      rawCarrierResponse: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  401: FOXPOST_AUTHENTICATION_ERROR_SCHEMA,
};

/**
 * Common response schema properties for batch parcel creation
 */
export const BATCH_PARCEL_RESPONSE_SCHEMA = {
  200: {
    description: 'All parcels created successfully',
    type: 'object',
    properties: {
      summary: { type: 'string' },
      successCount: { type: 'number' },
      failureCount: { type: 'number' },
      totalCount: { type: 'number' },
      allSucceeded: { type: 'boolean' },
      allFailed: { type: 'boolean' },
      someFailed: { type: 'boolean' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            carrierId: { type: 'string' },
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
            raw: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
      rawCarrierResponse: { type: 'object', additionalProperties: true },
    },
  },
  207: {
    description: 'Multi-Status - some parcels created, some failed',
    type: 'object',
    properties: {
      summary: { type: 'string' },
      successCount: { type: 'number' },
      failureCount: { type: 'number' },
      totalCount: { type: 'number' },
      allSucceeded: { type: 'boolean' },
      allFailed: { type: 'boolean' },
      someFailed: { type: 'boolean' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            carrierId: { type: 'string' },
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
            raw: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
      rawCarrierResponse: { type: 'object', additionalProperties: true },
    },
  },
  400: {
    description: 'All parcels failed or validation error',
    type: 'object',
    properties: {
      summary: { type: 'string' },
      successCount: { type: 'number' },
      failureCount: { type: 'number' },
      totalCount: { type: 'number' },
      allSucceeded: { type: 'boolean' },
      allFailed: { type: 'boolean' },
      someFailed: { type: 'boolean' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            carrierId: { type: 'string' },
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
            raw: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
      rawCarrierResponse: { type: 'object', additionalProperties: true },
    },
  },
  401: FOXPOST_AUTHENTICATION_ERROR_SCHEMA,
};

/**
 * Common response schema properties for tracking
 */
export const TRACKING_RESPONSE_SCHEMA = {
  200: {
    description: 'Successful tracking response',
    type: 'object',
    properties: {
      trackingNumber: { type: 'string' },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            status: { type: 'string' },
            carrierStatusCode: { type: 'string' },
            location: { type: 'object' },
            description: { type: 'string' },
            raw: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      },
      status: { type: 'string' },
      lastUpdate: { type: 'string', format: 'date-time' },
      raw: {
        type: 'object',
        additionalProperties: true,
      },
    }
  },
  400: {
    description: 'Client error (e.g. parcel not found)',
    type: 'object',
    properties: {
      message: { type: 'string' },
      category: { type: 'string' },
      carrierCode: { type: 'string' },
      raw: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  401: FOXPOST_AUTHENTICATION_ERROR_SCHEMA,
};

/**
 * Common response schema properties for single label creation
 */
export const SINGLE_LABEL_RESPONSE_SCHEMA = {
  200: {
    description: 'Successful label creation',
    type: 'object',
    properties: {
      carrierId: { type: 'string' },
      status: { type: 'string' },
      labelUrl: { type: ['string', 'null'], description: 'Base64-encoded PDF data URL' },
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
      raw: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  400: {
    description: 'Validation error or client error',
    type: 'object',
    properties: {
      carrierId: { type: 'string' },
      status: { type: 'string', enum: ['failed'] },
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
      raw: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  401: FOXPOST_AUTHENTICATION_ERROR_SCHEMA,
};

/**
 * Common response schema properties for batch label creation
 */
export const BATCH_LABEL_RESPONSE_SCHEMA = {
  200: {
    description: 'All labels created successfully',
    type: 'object',
    properties: {
      summary: { type: 'string' },
      successCount: { type: 'number' },
      failureCount: { type: 'number' },
      totalCount: { type: 'number' },
      allSucceeded: { type: 'boolean' },
      allFailed: { type: 'boolean' },
      someFailed: { type: 'boolean' },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            carrierId: { type: 'string' },
            status: { type: 'string' },
            labelUrl: { type: ['string', 'null'] },
            errors: { type: 'array', items: { type: 'object' } },
            raw: { type: 'object', additionalProperties: true },
          },
        },
      },
      rawCarrierResponse: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  207: {
    description: 'Partial success - some labels created, some failed',
    type: 'object',
    properties: {
      summary: { type: 'string' },
      successCount: { type: 'number' },
      failureCount: { type: 'number' },
      totalCount: { type: 'number' },
      allSucceeded: { type: 'boolean', enum: [false] },
      allFailed: { type: 'boolean', enum: [false] },
      someFailed: { type: 'boolean', enum: [true] },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            carrierId: { type: 'string' },
            status: { type: 'string' },
            labelUrl: { type: ['string', 'null'] },
            errors: { type: 'array', items: { type: 'object' } },
            raw: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
  400: {
    description: 'All labels failed',
    type: 'object',
    properties: {
      summary: { type: 'string' },
      successCount: { type: 'number' },
      failureCount: { type: 'number' },
      totalCount: { type: 'number' },
      allFailed: { type: 'boolean', enum: [true] },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            carrierId: { type: 'string' },
            status: { type: 'string', enum: ['failed'] },
            errors: { type: 'array', items: { type: 'object' } },
            raw: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
  401: FOXPOST_AUTHENTICATION_ERROR_SCHEMA,
};
