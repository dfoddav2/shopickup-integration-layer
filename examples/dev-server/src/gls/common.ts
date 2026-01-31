/**
 * GLS routes - Common utilities, schemas, and examples
 * Shared across all GLS route handlers
 */

/**
 * GLS pickup points response schema for OpenAPI documentation
 */
export const GLS_PICKUP_POINTS_RESPONSE_SCHEMA = {
  200: {
    description: 'Successfully fetched GLS pickup points',
    type: 'object',
    properties: {
      points: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the pickup point',
              example: '1001-SHOP01',
            },
            providerId: {
              type: 'string',
              description: 'GLS external/provider ID (for reference)',
              example: 'ext-1001',
            },
            name: {
              type: 'string',
              description: 'Display name of the pickup point',
              example: 'GLS ParcelShop Budapest',
            },
            country: {
              type: 'string',
              description: 'ISO 3166-1 alpha-2 country code',
              example: 'hu',
            },
            postalCode: {
              type: 'string',
              example: '1011',
            },
            city: {
              type: 'string',
              example: 'Budapest',
            },
            street: {
              type: 'string',
              example: 'Akadémia utca 3.',
            },
            address: {
              type: 'string',
              description: 'Full address string',
              example: 'Akadémia utca 3., 1011 Budapest',
            },
            latitude: {
              type: 'number',
              example: 47.50295,
            },
            longitude: {
              type: 'number',
              example: 19.03343,
            },
            openingHours: {
              type: 'object',
              description: 'Opening hours by day',
              additionalProperties: { type: 'string' },
              example: {
                Monday: '08:00 - 18:00',
                Tuesday: '08:00 - 18:00',
                Wednesday: '08:00 - 18:00',
                Thursday: '08:00 - 18:00',
                Friday: '08:00 - 18:00',
                Saturday: '09:00 - 14:00',
              },
            },
            contact: {
              type: 'object',
              description: 'Contact information',
              properties: {
                phone: { type: 'string' },
                email: { type: 'string' },
              },
            },
            pickupAllowed: {
              type: 'boolean',
              description: 'Whether parcels can be picked up at this location',
              example: true,
            },
            dropoffAllowed: {
              type: 'boolean',
              description: 'Whether parcels can be dropped off at this location',
              example: true,
            },
            isOutdoor: {
              type: 'boolean',
              description: 'Whether the pickup point is outdoors (e.g., parcel locker)',
              example: false,
            },
            paymentOptions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Accepted payment methods',
              example: ['cash', 'card'],
            },
          },
        },
      },
       summary: {
         type: 'object',
         properties: {
           totalCount: {
             type: 'number',
             example: 3,
           },
           updatedAt: {
             type: 'string',
             format: 'date-time',
             example: '2024-01-31T12:00:00.000Z',
           },
         },
       },
       rawCarrierResponse: {
         description: 'Full raw carrier response for debugging',
         type: 'array',
       },
    },
  },
  400: {
    description: 'Bad request - invalid country code',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        example: 'Country not supported by GLS',
      },
      category: {
        type: 'string',
        example: 'Validation',
      },
    },
  },
  500: {
    description: 'Server error - failed to fetch from GLS',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        example: 'Failed to fetch GLS pickup points: Network error',
      },
      category: {
        type: 'string',
        example: 'Transient',
      },
    },
  },
};

/**
 * Supported GLS countries for OpenAPI documentation
 */
export const GLS_SUPPORTED_COUNTRIES = [
  'AT', // Austria
  'BE', // Belgium
  'BG', // Bulgaria
  'CZ', // Czech Republic
  'DE', // Germany
  'DK', // Denmark
  'ES', // Spain
  'FI', // Finland
  'FR', // France
  'GR', // Greece
  'HR', // Croatia
  'HU', // Hungary
  'IT', // Italy
  'LU', // Luxembourg
  'NL', // Netherlands
  'PL', // Poland
  'PT', // Portugal
  'RO', // Romania
  'SI', // Slovenia
  'SK', // Slovakia
  'RS', // Serbia
];
