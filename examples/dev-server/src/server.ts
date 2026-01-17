import Fastify from "fastify";
import type { AdapterContext } from "../../../packages/core/src/interfaces/adapter-context.js";
import type { HttpClient } from "../../../packages/core/src/interfaces/http-client.js";
import FastifyCors from "@fastify/cors";
import { InMemoryStore } from "../../../packages/core/src/stores/in-memory.js";
import { FoxpostAdapter } from "../../../packages/adapters/foxpost/src/index.js";
import { executeCreateLabelFlow } from "../../../packages/core/src/index.js";
import axios from "axios";
import { randomUUID } from "crypto";

const fastify = Fastify({ logger: true });
fastify.register(FastifyCors, { origin: true });

// Register swagger and UI before routes so the plugin hooks onRoute events
import swaggerPlugin from '@fastify/swagger';
import swaggerUiPlugin from '@fastify/swagger-ui';


fastify.register(swaggerPlugin, {
  swagger: {
    info: { title: "Shopickup Dev Server", description: "Dev server for testing shopickup adapters", version: "1.0.0" },
    consumes: ["application/json"],
    produces: ["application/json"],
  },
});

fastify.register(swaggerUiPlugin, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "full",
    deepLinking: false,
  },
});

// Simple HTTP client wrapper compatible with AdapterContext.http

const httpClient = {
  async get<T = any>(url: string, options?: any): Promise<T> {
    const res = await axios.get(url, { ...options, responseType: options?.responseType || undefined });
    return res.data as T;
  },
  async post<T = any>(url: string, data?: any, options?: any): Promise<T> {
    const res = await axios.post(url, data, options);
    return res.data as T;
  },
  async put<T = any>(url: string, data?: any, options?: any): Promise<T> {
    const res = await axios.put(url, data, options);
    return res.data as T;
  },
  async patch<T = any>(url: string, data?: any, options?: any): Promise<T> {
    const res = await axios.patch(url, data, options);
    return res.data as T;
  },
  async delete<T = any>(url: string, options?: any): Promise<T> {
    const res = await axios.delete(url, options);
    return res.data as T;
  },
};

const store = new InMemoryStore();
const foxAdapter = new FoxpostAdapter("https://webapi-test.foxpost.hu");

// Register a plugin that defines routes — ensure this plugin is registered AFTER swagger
fastify.register(async (instance: any) => {
  // Health check
  instance.get("/health", {
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

  // Create label endpoint
  instance.post("/label", {
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
        400: { type: "object", properties: { error: { type: "string" } } },
        500: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request: any, reply: any) => {
      const anyBody = request.body as any;

    // Basic validation
    if (!anyBody?.shipment || !anyBody?.parcels || !Array.isArray(anyBody.parcels) || anyBody.parcels.length === 0) {
      return reply.status(400).send({ error: "shipment and parcels are required" });
    }

    const shipment = anyBody.shipment;
    const parcels = anyBody.parcels;
    const credentials = anyBody.credentials || { apiKey: process.env.FOXPOST_API_KEY };

    const context: AdapterContext = {
      http: httpClient as unknown as HttpClient,
      logger: instance.log as any,
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
        const lr: any = labelRes;
        if (lr.labelUrl) {
          const id = randomUUID();
          await store.saveLabel({
            id,
            parcelId: "",
            trackingNumber: lr.carrierId || "",
            carrier: foxAdapter.id || "foxpost",
            labelUrl: lr.labelUrl,
            createdAt: new Date(),
          });
        }
      }

      return reply.send(result);
    } catch (err: any) {
      instance.log.error(err);
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Fetch label by tracking number
  instance.get("/label/:trackingNumber", async (request: any, reply: any) => {
    const trackingNumber = (request.params as any).trackingNumber;
    const label = await store.getLabelByTrackingNumber(trackingNumber);
    if (!label) return reply.status(404).send({ error: "Label not found" });
    return reply.send(label);
  });

    // openapi debug endpoint
  instance.get('/openapi.json', async (request: any, reply: any) => {
    return instance.swagger ? instance.swagger() : {};
  });

});

// Debug: print registered routes so we can confirm Fastify saw them
console.log('Registered routes:\n', fastify.printRoutes());

// Start server
const start = async () => {
  try {
    // ensure all plugins are ready and then inspect the generated swagger spec
    await fastify.ready();
    try {
      const spec = fastify.swagger ? fastify.swagger() : null;
      console.log('Generated swagger paths:', spec ? Object.keys(spec.paths || {}).length : 'no-spec');
      console.log('Swagger paths keys:', spec ? Object.keys(spec.paths || {}) : []);
    } catch (e) {
      console.log('error getting swagger spec', e);
    }

    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log("Dev server listening on http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

