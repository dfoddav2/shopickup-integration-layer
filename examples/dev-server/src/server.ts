import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

// Create a Fastify instance
const fastify = Fastify({
    logger: true
});

// Register CORS plugin
await fastify.register(cors, {
    origin: '*'
});

// Register Swagger plugin
await fastify.register(swagger, {
    openapi: {
        openapi: '3.0.0',
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
            { name: "server", description: "Server related endpoints" }
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