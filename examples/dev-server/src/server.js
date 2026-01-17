import Fastify from "fastify";
import FastifyCors from "@fastify/cors";
import { SqliteStore } from "./store/sqlite-store";
import { FoxpostAdapter } from "@shopickup/adapters-foxpost"; // resolved via project references
import { executeCreateLabelFlow } from "@shopickup/core"; // resolved via project references
import axios from "axios";
import { randomUUID } from "crypto";
const fastify = Fastify({ logger: true });
fastify.register(FastifyCors, { origin: true });
// Register Swagger UI for interactive API testing
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
await fastify.register(swagger, {
    swagger: {
        info: { title: "Shopickup Dev Server", description: "Dev server for testing shopickup adapters", version: "1.0.0" },
        consumes: ["application/json"],
        produces: ["application/json"],
    },
});
await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
        docExpansion: "full",
        deepLinking: false,
    },
});
// Simple HTTP client wrapper compatible with AdapterContext.http
const httpClient = {
    async get(url, options) {
        const res = await axios.get(url, { ...options, responseType: options?.responseType || undefined });
        return res.data;
    },
    async post(url, data, options) {
        const res = await axios.post(url, data, options);
        return res.data;
    },
};
const store = new SqliteStore("./dev.db");
const foxAdapter = new FoxpostAdapter("https://webapi-test.foxpost.hu");
// Health check
fastify.get("/health", {
    schema: {
        description: "Health check",
        response: {
            200: {
                type: "object",
                properties: {
                    status: { type: "string" },
                    ts: { type: "string" },
                },
            },
        },
    },
}, async () => ({ status: "ok", ts: new Date().toISOString() }));
// Create label endpoint - demonstrates wiring of core + adapter + store
fastify.post("/label", {
    schema: {
        description: "Create parcels and generate labels",
        body: {
            type: "object",
            required: ["shipment", "parcels"],
            properties: {
                shipment: { type: "object" },
                parcels: { type: "array" },
                credentials: { type: "object" },
            },
        },
        response: {
            200: { type: "object" },
        },
    },
}, async (request, reply) => {
    const body = request.body;
    // Basic validation
    if (!body?.shipment || !body?.parcels || !Array.isArray(body.parcels) || body.parcels.length === 0) {
        return reply.status(400).send({ error: "shipment and parcels are required" });
    }
    const shipment = body.shipment;
    const parcels = body.parcels;
    const credentials = body.credentials || { apiKey: process.env.FOXPOST_API_KEY };
    const context = {
        http: httpClient,
        logger: fastify.log,
    };
    try {
        const result = await executeCreateLabelFlow({
            adapter: foxAdapter,
            shipment,
            parcels,
            credentials,
            context,
            store,
        });
        // Save label binary data if returned
        for (const labelRes of result.labelResources) {
            if (labelRes.labelUrl) {
                const id = randomUUID();
                await store.saveLabel({
                    id,
                    parcelId: "",
                    trackingNumber: labelRes.carrierId || "",
                    data: labelRes.labelUrl,
                    createdAt: new Date(),
                });
            }
        }
        return reply.send(result);
    }
    catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
});
// Basic endpoint to fetch label by tracking number
fastify.get("/label/:trackingNumber", async (request, reply) => {
    const trackingNumber = request.params.trackingNumber;
    const label = await store.getLabelByTrackingNumber(trackingNumber);
    if (!label)
        return reply.status(404).send({ error: "Label not found" });
    return reply.send(label);
});
// Start server
const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: "0.0.0.0" });
        console.log("Dev server listening on http://localhost:3000");
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=server.js.map