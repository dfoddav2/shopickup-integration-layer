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
 * Response schema for OAuth token exchange
 */
export const MPL_EXCHANGE_AUTH_TOKEN_RESPONSE_SCHEMA = {
  200: {
    description: 'Successfully exchanged API credentials for OAuth2 Bearer token',
    type: 'object',
    properties: {
      access_token: {
        type: 'string',
        description: 'OAuth2 access token to use in subsequent API calls',
        example: 'APRug5AE4VGAzNKDPAoxugLiDp0b'
      },
      token_type: {
        type: 'string',
        description: 'Token type (always "Bearer")',
        example: 'Bearer'
      },
      expires_in: {
        type: 'number',
        description: 'Token expiration time in seconds',
        example: 1799
      },
      issued_at: {
        type: 'number',
        description: 'Token issue timestamp (milliseconds since epoch)',
        example: 1592910455065
      },
      raw: {
        type: 'object',
        description: 'Full raw response from MPL OAuth2 endpoint',
        additionalProperties: true
      }
    },
    examples: [
      {
        access_token: 'APRug5AE4VGAzNKDPAoxugLiDp0b',
        token_type: 'Bearer',
        expires_in: 1799,
        issued_at: 1592910455065,
        raw: {
          access_token: 'APRug5AE4VGAzNKDPAoxugLiDp0b',
          token_type: 'Bearer',
          expires_in: 1799,
          issued_at: 1592910455065
        }
      }
    ]
  },
  400: {
    description: 'Validation error',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        example: 'Invalid request: exchangeAuthToken requires apiKey credentials, not oauth2 token'
      },
      category: {
        type: 'string',
        enum: ['Validation', 'Transient', 'Permanent'],
        example: 'Validation'
      },
      raw: { type: 'object', additionalProperties: true }
    }
  },
  401: {
    description: 'Authentication error - invalid API credentials',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        example: 'OAuth token exchange failed: Unauthorized (INVALID_CREDENTIALS)'
      },
      category: {
        type: 'string',
        enum: ['Auth'],
        example: 'Auth'
      },
      carrierCode: {
        type: 'string',
        example: 'INVALID_CREDENTIALS'
      },
      raw: { type: 'object', additionalProperties: true }
    }
  },
  500: {
    description: 'Server error',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        example: 'OAuth token exchange failed: Internal server error'
      },
      category: {
        type: 'string',
        enum: ['Transient'],
        example: 'Transient'
      },
      raw: { type: 'object', additionalProperties: true }
    }
  }
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

/**
 * MPL label options schema for OpenAPI documentation
 * Describes optional parameters for label generation
 */
export const MPL_LABEL_OPTIONS_SCHEMA = {
  type: 'object',
  description: 'Optional label generation parameters',
  properties: {
    useTestApi: {
      type: 'boolean',
      description: 'Use test/sandbox API endpoint',
      default: false,
    },
    labelType: {
      type: 'string',
      enum: ['A4', 'A5', 'A5inA4', 'A5E', 'A5E_EXTRA', 'A5E_STAND', 'A6', 'A6inA4', 'A4ONE'],
      description: 'Label format/size',
      default: 'A5',
    },
    labelFormat: {
      type: 'string',
      enum: ['PDF', 'ZPL'],
      description: 'Output format (PDF for printing, ZPL for thermal printers)',
      default: 'PDF',
    },
    orderBy: {
      type: 'string',
      enum: ['SENDING', 'IDENTIFIER'],
      description: 'Sort order for labels in batch',
      default: 'SENDING',
    },
    singleFile: {
      type: 'boolean',
      description: 'If true, combine all labels into single file; if false, individual files',
      default: false,
    },
  },
};

/**
 * Response schema for create label (single)
 * Describes the structure returned by MPL label creation endpoint
 */
export const MPL_CREATE_LABEL_RESPONSE_SCHEMA = {
  200: {
    description: 'Successfully created label for single parcel',
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Array of label file resources',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for this label file',
              example: 'label-uuid-1',
            },
            contentType: {
              type: 'string',
              description: 'MIME type of the file',
              enum: ['application/pdf', 'application/x-zpl'],
              example: 'application/pdf',
            },
            byteLength: {
              type: 'number',
              description: 'Size of the label file in bytes',
              example: 24576,
            },
            pages: {
              type: 'number',
              description: 'Number of pages in the label',
              example: 1,
            },
            orientation: {
              type: 'string',
              description: 'Page orientation',
              enum: ['portrait', 'landscape'],
              example: 'portrait',
            },
            url: {
              type: ['string', 'null'],
              description: 'URL to download the label (populated by integrator)',
              example: null,
            },
            dataUrl: {
              type: ['string', 'null'],
              description: 'Data URL with embedded label content (populated by integrator)',
              example: null,
            },
            metadata: {
              type: 'object',
              description: 'Label-specific metadata',
              properties: {
                size: {
                  type: 'string',
                  example: 'A5',
                },
                testMode: {
                  type: 'boolean',
                  example: false,
                },
              },
              additionalProperties: true,
            },
          },
        },
      },
      results: {
        type: 'array',
        description: 'Per-parcel label creation results',
        items: {
          type: 'object',
          properties: {
            inputId: {
              type: 'string',
              description: 'Original tracking number / input identifier',
              example: 'MLHUN12345671234567',
            },
            status: {
              type: 'string',
              enum: ['created', 'failed'],
              example: 'created',
            },
            fileId: {
              type: ['string', 'null'],
              description: 'Reference to file in files array (null if failed)',
              example: 'label-uuid-1',
            },
            pageRange: {
              type: 'object',
              description: 'Page range within file (null if failed)',
              properties: {
                start: {
                  type: 'number',
                  example: 1,
                },
                end: {
                  type: 'number',
                  example: 1,
                },
              },
              nullable: true,
            },
            error: {
              type: 'object',
              description: 'Error details if status is failed',
              properties: {
                message: {
                  type: 'string',
                  example: 'Invalid tracking number format',
                },
                category: {
                  type: 'string',
                  enum: ['Validation', 'Auth', 'Transient', 'RateLimit', 'Permanent'],
                  example: 'Validation',
                },
                carrierCode: {
                  type: 'string',
                  example: 'INVALID_FORMAT',
                },
              },
              nullable: true,
            },
          },
        },
      },
      successCount: {
        type: 'number',
        description: 'Number of successfully created labels',
        example: 1,
      },
      failureCount: {
        type: 'number',
        description: 'Number of failed label creations',
        example: 0,
      },
      totalCount: {
        type: 'number',
        description: 'Total number of requested labels',
        example: 1,
      },
      allSucceeded: {
        type: 'boolean',
        example: true,
      },
      allFailed: {
        type: 'boolean',
        example: false,
      },
      someFailed: {
        type: 'boolean',
        example: false,
      },
      summary: {
        type: 'string',
        description: 'Human-readable summary of batch results',
        example: '1 label created successfully',
      },
      rawCarrierResponse: {
        type: 'object',
        description: 'Raw base64-encoded PDF data or raw carrier response',
        additionalProperties: true,
      },
    },
    examples: [
      {
        files: [
          {
            id: 'label-uuid-1',
            contentType: 'application/pdf',
            byteLength: 24576,
            pages: 1,
            orientation: 'portrait',
            url: null,
            dataUrl: null,
            metadata: {
              size: 'A5',
              testMode: false,
            },
          },
        ],
        results: [
          {
            inputId: 'MLHUN12345671234567',
            status: 'created',
            fileId: 'label-uuid-1',
            pageRange: {
              start: 1,
              end: 1,
            },
            error: null,
          },
        ],
        successCount: 1,
        failureCount: 0,
        totalCount: 1,
        allSucceeded: true,
        allFailed: false,
        someFailed: false,
        summary: '1 label created successfully',
        rawCarrierResponse: {
          label: 'base64EncodedPdfData...',
        },
      },
    ],
  },
  400: {
    description: 'Validation error',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        example: 'Validation error: accountingCode is required for label creation',
      },
      category: {
        type: 'string',
        enum: ['Validation', 'Transient', 'Permanent'],
        example: 'Validation',
      },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
        },
      },
      raw: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
  401: MPL_AUTHENTICATION_ERROR_SCHEMA,
  207: {
    description: 'Partial success - some labels created, some failed',
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'File resources for successfully created labels',
        items: { type: 'object', additionalProperties: true },
      },
      results: {
        type: 'array',
        description: 'Per-parcel results with successes and failures mixed',
        items: { type: 'object', additionalProperties: true },
      },
      successCount: { type: 'number' },
      failureCount: { type: 'number' },
      totalCount: { type: 'number' },
      allSucceeded: { type: 'boolean' },
      allFailed: { type: 'boolean' },
      someFailed: { type: 'boolean' },
      summary: { type: 'string' },
      rawCarrierResponse: { type: 'object', additionalProperties: true },
    },
  },
  429: {
    description: 'Rate limit exceeded',
    type: 'object',
    properties: {
      message: { type: 'string', example: 'MPL API error: Too many requests (RATE_LIMIT_EXCEEDED)' },
      category: { type: 'string', enum: ['RateLimit'], example: 'RateLimit' },
      retryAfterMs: { type: 'number', example: 60000 },
      raw: { type: 'object', additionalProperties: true },
    },
  },
  500: {
    description: 'Server error',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        example: 'MPL API error: Internal server error (INTERNAL_ERROR)',
      },
      category: {
        type: 'string',
        enum: ['Transient'],
        example: 'Transient',
      },
      mplErrorCode: { type: 'string' },
      mplFaultString: { type: 'string' },
      raw: { type: 'object', additionalProperties: true },
    },
  },
};

/**
 * Response schema for create labels (batch)
 * Same structure as single label response, typically with multiple file resources
 */
export const MPL_CREATE_LABELS_RESPONSE_SCHEMA = MPL_CREATE_LABEL_RESPONSE_SCHEMA;
