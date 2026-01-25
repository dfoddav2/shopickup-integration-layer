// Load environment variables from .env file (before anything else)
import 'dotenv/config';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { registerFoxpostRoutes } from './foxpost/index.js';
import { registerMPLRoutes } from './mpl/index.js';

// Create a Fastify instance
const isDev = process.env.NODE_ENV !== 'production';
const fastify = Fastify({
    logger: {
        // Default to 'info' level (cleaner logs). Override with LOG_LEVEL env var.
        // Set LOG_LEVEL=debug for verbose HTTP client debugging
        level: process.env.LOG_LEVEL ?? (isDev ? 'info' : 'info'),
        transport: isDev ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'hostname,pid'
            }
        } : undefined
    }
});

// Attach HttpClient after Fastify is created so it uses the same logger
import { makeHttpClient } from './http-client.js';
const client = makeHttpClient(fastify.log as any);
fastify.decorate('httpClient', client);


// Register CORS plugin
await fastify.register(cors, {
    origin: '*'
});

// Register Swagger plugin
await fastify.register(swagger, {
    openapi: {
        openapi: '3.1.0',
        info: {
            title: "Shopickup Example Dev Server",
            description: "API documentation for the Shopickup Example Dev Server",
            version: "1.0.0"
        },
        servers: [
            {
                url: "http://localhost:3000",
                description: "Local development server"
            }
        ],
        tags: [
            { name: "server", description: "Server related endpoints" },
            { name: "Foxpost", description: "Foxpost carrier adapter dev endpoints" },
            { name: "MPL", description: "MPL carrier adapter dev endpoints" },
            { name: "Dev", description: "Development and testing endpoints" }
        ]
    }
});
await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    // uiConfig: {
    //     docExpansion: 'full',
    //     deepLinking: false
    // },
})

// Register custom error handler for validation errors
// IMPORTANT: Register BEFORE routes so it catches all errors
fastify.setErrorHandler((error: any, request, reply) => {
    // Log the error
    fastify.log.error(error);

    // Check if it's a Fastify validation error
    if (error.statusCode === 400 && error.validation) {
        return reply.status(400).send({
            message: 'Validation error',
            category: 'Validation',
            errors: error.validation,
            statusCode: 400,
        });
    }

    // Check if it's a Fastify schema error (invalid enum, etc)
    if (error.statusCode === 400) {
        return reply.status(400).send({
            message: error.message || 'Validation error',
            category: 'Validation',
            statusCode: 400,
        });
    }

    // Handle 404 errors
    if (error.statusCode === 404) {
        return reply.status(404).send({
            message: 'Route not found',
            category: 'NotFound',
            statusCode: 404,
        });
    }

    // Default error response
    return reply.status(error.statusCode || 500).send({
        message: error.message || 'Internal server error',
        category: 'Internal',
        statusCode: error.statusCode || 500,
    });
});

// Declare routes
// fastify.get('/', function (request, reply) {
//     reply.send({ hello: 'world' })
// })

fastify.get("/health", {
    schema: {
        description: 'Health check endpoint',
        tags: ['server'],
        summary: 'Check server health',
        response: {
            200: {
                description: 'Successful response',
                type: 'object',
                properties: {
                    status: { type: 'string' },
                    ts: { type: 'string', format: 'date-time' }
                }
            },
        }
    }
}, async () => ({ status: "ok", ts: new Date().toISOString() }));

/**
 * Admin endpoint to get/set log level at runtime (development only)
 * 
 * GET /admin/logging - Returns current log level
 * POST /admin/logging - Sets log level (body: { level: 'debug' | 'info' | 'warn' | 'error' })
 * 
 * Useful for toggling verbose output without restarting the server.
 * Example: curl http://localhost:3000/admin/logging?level=debug
 */
fastify.get("/admin/logging", {
    schema: {
        description: 'Get current server log level',
        tags: ['server'],
        summary: 'Get logging level',
        querystring: {
            type: 'object',
            properties: {
                level: {
                    type: 'string',
                    enum: ['debug', 'info', 'warn', 'error', 'fatal', 'silent'],
                    description: 'Optional: set log level instead of just getting it'
                }
            }
        },
        response: {
            200: {
                description: 'Current log level',
                type: 'object',
                properties: {
                    level: { type: 'string' },
                    message: { type: 'string' }
                }
            },
        }
    }
}, async (request: any, reply: any) => {
    const newLevel = request.query?.level;
    
    if (newLevel) {
        // Change log level
        fastify.log.level = newLevel;
        return {
            level: newLevel,
            message: `Log level changed to '${newLevel}'`
        };
    }
    
    // Return current level
    return {
        level: fastify.log.level,
        message: 'Current log level'
    };
});

fastify.post("/admin/logging", {
    schema: {
        description: 'Set server log level',
        tags: ['server'],
        summary: 'Set logging level',
        body: {
            type: 'object',
            properties: {
                level: {
                    type: 'string',
                    enum: ['debug', 'info', 'warn', 'error', 'fatal', 'silent']
                }
            },
            required: ['level']
        },
        response: {
            200: {
                description: 'Log level updated',
                type: 'object',
                properties: {
                    level: { type: 'string' },
                    message: { type: 'string' }
                }
            },
        }
    }
}, async (request: any, reply: any) => {
    const { level } = request.body as { level: string };
    fastify.log.level = level;
    return {
        level,
        message: `Log level changed to '${level}'`
    };
});

// Register Foxpost dev routes
await registerFoxpostRoutes(fastify);

// Register MPL dev routes
await registerMPLRoutes(fastify);

// Run the server!
await fastify.ready();
fastify.swagger();

fastify.listen({ port: 3000 }, function (err, address) {
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }
    // Server is now listening on ${address}
})