declare module "@fastify/swagger" {
  const x: any; export default x;
}

declare module "@fastify/swagger-ui" {
  const x: any; export default x;
}

// Augment Fastify instance with swagger() helper returned by the plugin
declare module "fastify" {
  interface FastifyInstance {
    swagger?: () => any;
  }
}
