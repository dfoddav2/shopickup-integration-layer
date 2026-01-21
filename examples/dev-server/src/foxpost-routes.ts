import { FastifyInstance } from 'fastify';
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { CarrierError, type AdapterContext, type CreateParcelRequest, type CreateParcelsRequest, type Parcel } from '@shopickup/core';

// httpClient will be provided via fastify.decorate; create it in server.ts and attach to fastify

export async function registerFoxpostRoutes(fastify: FastifyInstance) {
  const adapter = new FoxpostAdapter();

  // Single-item create parcel endpoint
  fastify.post('/api/dev/foxpost/create-parcel', {
    schema: {
      description: 'Create a Foxpost parcel (dev endpoint for testing)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Create a parcel in Foxpost',
    }
  }, async (request, reply) => {
    const body = request.body as any;

    fastify.log.info({ endpoint: '/api/dev/foxpost/create-parcel', parcelId: body?.id }, 'Foxpost createParcel request');

    try {
      if (!body || !body.id || !body.sender || !body.recipient || !body.weight || !body.credentials?.apiKey) {
        return (reply as any).code(400).send({ message: 'Missing required parcel fields (id, sender, recipient, weight, service) or credentials.apiKey', category: 'Validation' });
      }

      const parcel: Parcel = body as Parcel;

      const req: CreateParcelRequest = {
        parcel,
        credentials: body.credentials,
        options: body.options
      };

      const ctx: AdapterContext = { http: (fastify as any).httpClient as any, logger: fastify.log };

      const result = await adapter.createParcel!(req, ctx);

      return reply.send(result);
    } catch (err) {
      fastify.log.error(err, 'Error in createParcel');
      if (err instanceof CarrierError) {
        return (reply as any).code(502).send({ message: err.message, category: err.category });
      }
      return (reply as any).code(500).send({ message: 'Internal server error' });
    }
  });

  // Batch create endpoint
  fastify.post('/api/dev/foxpost/create-parcels', {
    schema: {
      description: 'Create multiple Foxpost parcels (dev endpoint for testing)',
      tags: ['Foxpost', 'Dev'],
      summary: 'Create multiple parcels in Foxpost',
    }
  }, async (request, reply) => {
    const body = request.body as any;

    fastify.log.info({ endpoint: '/api/dev/foxpost/create-parcels', itemCount: body?.parcels?.length ?? 0 }, 'Foxpost createParcels request');

    try {
      // Expect: { parcels: [...], credentials: {...}, options: {...} } - CreateParcelsRequest format
      if (!body || !Array.isArray(body.parcels) || body.parcels.length === 0) {
        return (reply as any).code(400).send({ message: 'Body must be an object with parcels array (non-empty)', category: 'Validation' });
      }

      if (!body.credentials?.apiKey) {
        return (reply as any).code(400).send({ message: 'Credentials with apiKey required', category: 'Validation' });
      }

      // Validate all parcel items
      for (const p of body.parcels) {
        if (!p.id || !p.sender || !p.recipient || !p.weight) {
          return (reply as any).code(400).send({ message: 'Each parcel must have id, sender, recipient, weight, service', category: 'Validation' });
        }
      }

      const parcelsReq: CreateParcelsRequest = {
        parcels: body.parcels as Parcel[],
        credentials: body.credentials,
        options: body.options,
      };

      const ctx: AdapterContext = { http: (fastify as any).httpClient as any, logger: fastify.log };

      if (!(adapter as any).createParcels) {
        // Fallback: call createParcel for each item if batch not available
        const results: any[] = [];
        for (const p of parcelsReq.parcels) {
          try {
            const req: CreateParcelRequest = {
              parcel: p,
              credentials: parcelsReq.credentials,
              options: parcelsReq.options,
            };
            const res = adapter.createParcel ? await adapter.createParcel(req, ctx) : null;
            results.push(res);
          } catch (err) {
            if (err instanceof CarrierError) {
              results.push({ carrierId: null, status: 'failed', raw: { message: err.message, category: err.category } });
            } else {
              results.push({ carrierId: null, status: 'failed', raw: { message: String(err) } });
            }
          }
        }
        return reply.send(results);
      }

      const results = await (adapter as any).createParcels(parcelsReq, ctx);
      return reply.send(results);
    } catch (err) {
      fastify.log.error(err, 'Error in createParcels');
      if (err instanceof CarrierError) {
        return (reply as any).code(502).send({ message: err.message, category: err.category });
      }
      return (reply as any).code(500).send({ message: 'Internal server error' });
    }
  });

  fastify.log.info('Registered Foxpost dev routes');
}

declare module 'fastify' {
  interface FastifyInstance {
    httpClient?: any;
  }
}
