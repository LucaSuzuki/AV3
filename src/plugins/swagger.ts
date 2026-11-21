import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { versoes } from '../config/versoes';

const prefixoPublico = '/api/v1/public/';

export async function registrarSwagger(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: { title: 'Greencode AV3', version: '3.0.0', description: 'Logística reversa de resíduos eletrônicos.' },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearerAuth: [] }],
    },
    transform: ({ schema, url }) => ({ schema: url.startsWith(prefixoPublico) ? { ...schema, hide: true } : schema, url }),
  });
  await app.register(swaggerUI, { routePrefix: '/docs' });
}

export async function registrarSwaggerPublico(app: FastifyInstance) {
  await app.register(swagger, {
    decorator: 'swaggerPublico',
    openapi: {
      info: { title: 'Greencode API de parceiros', version: versoes.v1.versao, description: 'Rastreabilidade, lotes e relatórios da organização do parceiro.' },
      components: { securitySchemes: { apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' } } },
      security: [{ apiKeyAuth: [] }],
    },
    transform: ({ schema, url }) => ({ schema: url.startsWith(prefixoPublico) ? schema : { ...schema, hide: true }, url }),
  });
  Object.defineProperty(app, 'swagger', { value: (app as FastifyInstance & { swaggerPublico: FastifyInstance['swagger'] }).swaggerPublico });
  await app.register(swaggerUI, { routePrefix: '/docs/public' });
}
