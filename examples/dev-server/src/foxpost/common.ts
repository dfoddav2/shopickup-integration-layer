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
      inputId: { 
        type: 'string',
        description: 'The parcel carrier ID that was requested',
        example: 'CLFOX0000000001'
      },
      status: { 
        type: 'string',
        enum: ['created', 'failed', 'skipped'],
        example: 'created'
      },
      fileId: { 
        type: 'string',
        description: 'UUID reference to the file in files array',
        example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      },
      pageRange: {
        type: 'object',
        description: 'Page range in the PDF (for multi-label PDFs)',
        properties: {
          start: { type: 'integer', example: 1 },
          end: { type: 'integer', example: 1 }
        }
      },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
      raw: {
        type: 'object',
        additionalProperties: true,
        description: 'Raw carrier API response'
      },
    },
  },
  400: {
    description: 'Validation error or client error',
    type: 'object',
    properties: {
      inputId: { type: 'string' },
      status: { type: 'string', enum: ['failed'] },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
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
      summary: { 
        type: 'string',
        example: 'All 3 labels created successfully'
      },
      successCount: { type: 'number', example: 3 },
      failureCount: { type: 'number', example: 0 },
      totalCount: { type: 'number', example: 3 },
      allSucceeded: { type: 'boolean', example: true },
      allFailed: { type: 'boolean', example: false },
      someFailed: { type: 'boolean', example: false },
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            inputId: { 
              type: 'string',
              description: 'The parcel carrier ID that was requested',
              example: 'CLFOX0000000001'
            },
            status: { 
              type: 'string',
              enum: ['created', 'failed', 'skipped'],
              example: 'created'
            },
            fileId: { 
              type: 'string',
              description: 'UUID reference to the file in files array',
              example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
            },
            pageRange: {
              type: 'object',
              description: 'Page range in the PDF',
              properties: {
                start: { type: 'integer' },
                end: { type: 'integer' }
              }
            },
            errors: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', description: 'Error code' },
                  message: { type: 'string', description: 'Error message' },
                  field: { type: 'string', description: 'Field that caused the error (optional)' }
                },
                required: ['message']
              },
              description: 'Error details if status is failed'
            },
            raw: { 
              type: 'object', 
              additionalProperties: true,
              description: 'Raw carrier response for this result'
            },
          },
        },
      },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { 
              type: 'string',
              description: 'UUID for this file',
              example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
            },
            dataUrl: {
              type: 'string',
              description: 'Base64-encoded PDF data URL (remove for production CDN upload)',
              example: 'data:application/pdf;base64,JVBERi0xLjQK...'
            },
            contentType: { 
              type: 'string',
              example: 'application/pdf'
            },
            byteLength: { 
              type: 'integer',
              description: 'File size in bytes',
              example: 45678
            },
            pages: { 
              type: 'integer',
              description: 'Number of pages in PDF',
              example: 3
            },
            orientation: {
              type: 'string',
              enum: ['portrait', 'landscape'],
              description: 'Page orientation',
              example: 'portrait'
            },
            metadata: {
              type: 'object',
              description: 'Carrier-specific metadata',
              additionalProperties: true,
              example: { carrier: 'foxpost', size: 'A7', isPortrait: true }
            },
          },
        },
        description: 'File artifacts - each file may be referenced by multiple results'
      },
      rawCarrierResponse: {
        type: 'object',
        additionalProperties: true,
        description: 'Raw carrier API response'
      },
    },
  },
  207: {
    description: 'Partial success - some labels created, some failed',
    type: 'object',
    properties: {
      summary: { 
        type: 'string',
        example: 'Mixed results: 2 succeeded, 1 failed'
      },
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
             inputId: { type: 'string' },
             status: { type: 'string', enum: ['created', 'failed'] },
             fileId: { type: 'string' },
             pageRange: { type: 'object' },
             errors: { 
               type: 'array', 
               items: {
                 type: 'object',
                 properties: {
                   code: { type: 'string' },
                   message: { type: 'string' },
                   field: { type: 'string' }
                 }
               }
             },
             raw: { type: 'object', additionalProperties: true },
           },
        },
      },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            dataUrl: { type: 'string' },
            contentType: { type: 'string' },
            byteLength: { type: 'integer' },
            pages: { type: 'integer' },
            metadata: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  },
  400: {
    description: 'All labels failed or validation error',
    type: 'object',
    properties: {
      summary: { 
        type: 'string',
        example: 'All 3 labels failed'
      },
      successCount: { type: 'number', example: 0 },
      failureCount: { type: 'number', example: 3 },
      totalCount: { type: 'number', example: 3 },
      allFailed: { type: 'boolean', enum: [true] },
      allSucceeded: { type: 'boolean', enum: [false] },
      someFailed: { type: 'boolean', enum: [true] },
      results: {
        type: 'array',
        items: {
          type: 'object',
           properties: {
             inputId: { type: 'string' },
             status: { type: 'string', enum: ['failed'] },
             errors: { 
               type: 'array', 
               items: {
                 type: 'object',
                 properties: {
                   code: { type: 'string' },
                   message: { type: 'string' },
                   field: { type: 'string' }
                 }
               }
             },
             raw: { type: 'object', additionalProperties: true },
           },
         },
       },
     },
   },
   401: FOXPOST_AUTHENTICATION_ERROR_SCHEMA,
 };
 
 /**
  * Common response schema properties for pickup points list
  */
 export const PICKUP_POINTS_RESPONSE_SCHEMA = {
   200: {
     description: 'Successfully fetched pickup points',
     type: 'object',
     properties: {
       points: {
         type: 'array',
         items: {
           type: 'object',
           properties: {
             id: { 
               type: 'string',
               description: 'Unique identifier (operator_id or place_id)',
               example: 'hu5844'
             },
             providerId: { 
               type: 'string',
               description: 'Provider native ID (for reference)',
               example: '1444335'
             },
             name: { 
               type: 'string',
               example: 'FOXPOST A-BOX Nyíregyháza REpont Hősök tere'
             },
             country: { 
               type: 'string',
               example: 'hu'
             },
             postalCode: { 
               type: 'string',
               example: '4400'
             },
             city: { 
               type: 'string',
               example: 'Nyíregyháza'
             },
             street: { 
               type: 'string',
               example: 'Hősök tere 15.'
             },
             address: { 
               type: 'string',
               example: '4400 Nyíregyháza, Hősök tere 15.'
             },
             findme: { 
               type: 'string',
               description: 'Location hint',
               example: 'Inside the building'
             },
             latitude: { 
               type: 'number',
               example: 47.956969
             },
             longitude: { 
               type: 'number',
               example: 21.716012
             },
             openingHours: {
               type: 'object',
               description: 'Opening hours by day',
               example: { hetfo: '00:00-24:00', kedd: '00:00-24:00' }
             },
             dropoffAllowed: { 
               type: 'boolean',
               example: true
             },
             pickupAllowed: { 
               type: 'boolean',
               example: true
             },
             isOutdoor: { 
               type: 'boolean',
               example: false
             },
             paymentOptions: {
               type: 'array',
               items: { type: 'string' },
               example: ['card', 'link']
             },
             metadata: {
               type: 'object',
               description: 'Carrier-specific fields',
               additionalProperties: true,
               example: { 
                 depot: 'Debrecen Depo',
                 apmType: 'Rollkon',
                 variant: 'FOXPOST A-BOX'
               }
             },
             raw: {
               type: 'object',
               description: 'Full raw carrier response for this point',
               additionalProperties: true
             }
           }
         }
       },
       summary: {
         type: 'object',
         properties: {
           totalCount: { type: 'number', example: 150 },
           updatedAt: { type: 'string', format: 'date-time' }
         }
       },
       rawCarrierResponse: {
         type: 'array',
         description: 'Full raw response from Foxpost feed'
       }
     }
   },
   400: {
     description: 'Error fetching pickup points',
     type: 'object',
     properties: {
       message: { type: 'string' },
       category: { type: 'string' },
       raw: { type: 'object', additionalProperties: true }
     }
   }
 };
