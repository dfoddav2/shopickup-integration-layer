/**
 * MPL routes - Common utilities, schemas, and examples
 * Shared across all MPL route handlers
 */

/**
 * Common error response schema for authentication failures
 */
export const MPL_AUTHENTICATION_ERROR_SCHEMA = {
  description: 'Authentication error - invalid carrier credentials',
  type: 'object',
  properties: {
    message: {
      type: 'string',
      example: 'MPL API error: The provided access token is not valid (INVALID_TOKEN)'
    },
    category: {
      type: 'string',
      enum: ['Auth', 'Validation', 'Transient', 'RateLimit', 'Permanent'],
      example: 'Auth'
    },
    mplErrorCode: {
      type: 'string',
      example: 'INVALID_TOKEN'
    },
    mplFaultString: {
      type: 'string',
      example: 'The provided access token is not valid'
    },
    raw: {
      type: 'object',
      properties: {
        fault: {
          type: 'object',
          properties: {
            faultstring: { type: 'string' },
            detail: {
              type: 'object',
              properties: {
                errorcode: { type: 'string' }
              }
            }
          }
        }
      }
    },
  },
};

/**
 * MPL credentials schema for OpenAPI documentation
 */
export const MPL_CREDENTIALS_SCHEMA = {
  type: 'object',
  description: 'MPL API credentials - supports both API Key and OAuth2',
  oneOf: [
    {
      type: 'object',
      properties: {
        authType: { type: 'string', enum: ['apiKey'] },
        apiKey: { type: 'string', description: 'API key for authentication' },
        apiSecret: { type: 'string', description: 'API secret for authentication' },
      },
      required: ['apiKey', 'apiSecret'],
    },
    {
      type: 'object',
      properties: {
        authType: { type: 'string', enum: ['oauth2'] },
        oAuth2Token: { type: 'string', description: 'OAuth2 access token' },
      },
      required: ['oAuth2Token'],
    },
  ],
};

/**
 * MPL request options schema for OpenAPI documentation
 */
export const MPL_OPTIONS_SCHEMA = {
  type: 'object',
  description: 'Optional request options',
  properties: {
    useTestApi: {
      type: 'boolean',
      description: 'Use test/sandbox API endpoint',
      default: false,
    },
  },
};

/**
 * Example: MPL credentials with API Key
 */
export const EXAMPLE_MPL_CREDENTIALS_APIKEY = {
  authType: 'apiKey',
  apiKey: 'demo-api-key-12345',
  apiSecret: 'demo-api-secret-67890',
};

/**
 * Example: MPL credentials with OAuth2
 */
export const EXAMPLE_MPL_CREDENTIALS_OAUTH = {
  authType: 'oauth2',
  oAuth2Token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
};

/**
 * Response schema for pickup points list
 * Describes the structure returned by MPL /deliveryplace endpoint
 * Includes one comprehensive example with 3 different delivery place types
 */
export const MPL_PICKUP_POINTS_RESPONSE_SCHEMA = {
  200: {
    description: 'Successfully fetched pickup points from MPL API',
    type: 'object',
    properties: {
      points: {
        type: 'array',
        description: 'Array of normalized pickup points',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for this delivery place',
              example: 'hu-bp-001'
            },
            name: {
              type: 'string',
              description: 'Display name of the delivery place',
              example: 'Magyar Posta - Budapest 6. kerület'
            },
            country: {
              type: 'string',
              description: 'ISO 3166-1 alpha-2 country code (lowercase)',
              example: 'hu'
            },
            postalCode: {
              type: 'string',
              description: '4-character postal code',
              example: '1065'
            },
            city: {
              type: 'string',
              example: 'Budapest'
            },
            street: {
              type: 'string',
              example: 'Szondi utca 45.'
            },
            address: {
              type: 'string',
              description: 'Full address string',
              example: '1065 Budapest, Szondi utca 45.'
            },
            latitude: {
              type: 'number',
              description: 'Latitude coordinate for map display',
              example: 47.5234
            },
            longitude: {
              type: 'number',
              description: 'Longitude coordinate for map display',
              example: 19.0234
            },
            pickupAllowed: {
              type: 'boolean',
              description: 'Whether customer can pick up parcels from this location',
              example: true
            },
            dropoffAllowed: {
              type: 'boolean',
              description: 'Whether customer can drop off parcels at this location',
              example: true
            },
            paymentOptions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Accepted payment methods',
              example: ['card', 'cash']
            },
            metadata: {
              type: 'object',
              description: 'Carrier-specific fields from MPL response',
              properties: {
                deliveryplace: {
                  type: 'string',
                  description: 'MPL delivery place identifier'
                },
                errors: {
                  type: ['array', 'null'],
                  description: 'Validation errors if any',
                  items: {
                    type: 'object',
                    properties: {
                      code: { type: 'string' },
                      parameter: { type: 'string' },
                      text: { type: 'string' },
                      text_eng: { type: 'string' }
                    }
                  }
                }
              },
              additionalProperties: true
            },
            raw: {
              type: 'object',
              description: 'Full raw MPL response for this delivery place',
              additionalProperties: true
            }
          }
        }
      },
      summary: {
        type: 'object',
        description: 'Summary information about the response',
        properties: {
          totalCount: {
            type: 'number',
            description: 'Total number of pickup points returned',
            example: 45
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Timestamp when response was generated',
            example: '2026-01-25T14:30:00Z'
          }
        }
      },
      rawCarrierResponse: {
        type: 'array',
        description: 'Full raw response array from MPL API',
        items: {
          type: 'object',
          additionalProperties: true
        }
      }
    },
    examples: [
      {
        points: [
          {
            id: 'hu-bp-001',
            name: 'Magyar Posta - Budapest 6. kerület',
            country: 'hu',
            postalCode: '1065',
            city: 'Budapest',
            street: 'Szondi utca 45.',
            address: '1065 Budapest, Szondi utca 45.',
            latitude: 47.5234,
            longitude: 19.0234,
            pickupAllowed: true,
            dropoffAllowed: true,
            paymentOptions: ['card', 'cash'],
            metadata: {
              deliveryplace: 'Magyar Posta - Budapest 6. kerület',
              errors: null
            },
            raw: {
              deliveryplacesQueryResult: {
                deliveryplace: 'Magyar Posta - Budapest 6. kerület',
                postCode: '1065',
                city: 'Budapest',
                address: '1065 Budapest, Szondi utca 45.',
                geocodeLat: 47.5234,
                geocodeLong: 19.0234,
                id: 'hu-bp-001',
                errors: null
              },
              servicePointType: ['PM', 'PP']
            }
          },
          {
            id: 'hu-bp-002',
            name: 'PostaPont - Budapest 7. kerület',
            country: 'hu',
            postalCode: '1072',
            city: 'Budapest',
            street: 'Kazinczy utca 18.',
            address: '1072 Budapest, Kazinczy utca 18.',
            latitude: 47.4856,
            longitude: 19.0721,
            pickupAllowed: true,
            dropoffAllowed: true,
            paymentOptions: ['card'],
            metadata: {
              deliveryplace: 'PostaPont - Budapest 7. kerület',
              errors: null
            },
            raw: {
              deliveryplacesQueryResult: {
                deliveryplace: 'PostaPont - Budapest 7. kerület',
                postCode: '1072',
                city: 'Budapest',
                address: '1072 Budapest, Kazinczy utca 18.',
                geocodeLat: 47.4856,
                geocodeLong: 19.0721,
                id: 'hu-bp-002',
                errors: null
              },
              servicePointType: ['PP', 'CS']
            }
          },
          {
            id: 'hu-bp-003',
            name: 'Csomagautomata - Budapest 8. kerület',
            country: 'hu',
            postalCode: '1082',
            city: 'Budapest',
            street: 'Baross utca 12.',
            address: '1082 Budapest, Baross utca 12.',
            latitude: 47.4950,
            longitude: 19.0654,
            pickupAllowed: true,
            dropoffAllowed: true,
            paymentOptions: [],
            metadata: {
              deliveryplace: 'Csomagautomata - Budapest 8. kerület',
              errors: null
            },
            raw: {
              deliveryplacesQueryResult: {
                deliveryplace: 'Csomagautomata - Budapest 8. kerület',
                postCode: '1082',
                city: 'Budapest',
                address: '1082 Budapest, Baross utca 12.',
                geocodeLat: 47.4950,
                geocodeLong: 19.0654,
                id: 'hu-bp-003',
                errors: null
              },
              servicePointType: ['CS']
            }
          }
        ],
        summary: {
          totalCount: 3,
          updatedAt: '2026-01-25T14:30:00Z'
        },
        rawCarrierResponse: [
          {
            deliveryplacesQueryResult: {
              deliveryplace: 'Magyar Posta - Budapest 6. kerület',
              postCode: '1065',
              city: 'Budapest',
              address: '1065 Budapest, Szondi utca 45.',
              geocodeLat: 47.5234,
              geocodeLong: 19.0234,
              id: 'hu-bp-001',
              errors: null
            },
            servicePointType: ['PM', 'PP']
          },
          {
            deliveryplacesQueryResult: {
              deliveryplace: 'PostaPont - Budapest 7. kerület',
              postCode: '1072',
              city: 'Budapest',
              address: '1072 Budapest, Kazinczy utca 18.',
              geocodeLat: 47.4856,
              geocodeLong: 19.0721,
              id: 'hu-bp-002',
              errors: null
            },
            servicePointType: ['PP', 'CS']
          },
          {
            deliveryplacesQueryResult: {
              deliveryplace: 'Csomagautomata - Budapest 8. kerület',
              postCode: '1082',
              city: 'Budapest',
              address: '1082 Budapest, Baross utca 12.',
              geocodeLat: 47.4950,
              geocodeLong: 19.0654,
              id: 'hu-bp-003',
              errors: null
            },
            servicePointType: ['CS']
          }
        ]
      }
    ]
  },
  400: {
    description: 'Validation error',
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Invalid request: postCode must be 4 characters' },
      category: { type: 'string', enum: ['Validation', 'Transient', 'Permanent'], example: 'Validation' },
      raw: { type: 'object', additionalProperties: true }
    }
  },
  401: MPL_AUTHENTICATION_ERROR_SCHEMA,
  429: {
    description: 'Rate limit exceeded',
    type: 'object',
    properties: {
      message: { type: 'string', example: 'MPL API error: Too many requests (RATE_LIMIT_EXCEEDED)' },
      category: { type: 'string', enum: ['RateLimit'], example: 'RateLimit' },
      retryAfterMs: { type: 'number', example: 60000 },
      quotaReset: { type: 'string', example: '1234567890' },
      quotaAllowed: { type: 'string', example: '1000' },
      quotaAvailable: { type: 'string', example: '0' },
      raw: { type: 'object', additionalProperties: true }
    }
  },
  500: {
    description: 'Server error',
    type: 'object',
    properties: {
      message: { type: 'string', example: 'MPL API error: Internal server error (INTERNAL_ERROR)' },
      category: { type: 'string', enum: ['Transient'], example: 'Transient' },
      mplErrorCode: { type: 'string' },
      mplFaultString: { type: 'string' },
      raw: { type: 'object', additionalProperties: true }
    }
  }
};
