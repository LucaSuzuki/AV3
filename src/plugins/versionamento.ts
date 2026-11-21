import type { FastifyInstance } from 'fastify';
import type { VersaoPublica } from '../config/versoes';

export function registrarVersionamento(app: FastifyInstance, versao: VersaoPublica) {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-API-Version', versao.versao).header('X-Request-Id', request.id);
    if (versao.depreciadaEm) reply.header('Deprecation', '@' + Math.floor(versao.depreciadaEm.getTime() / 1000));
    if (versao.sunsetEm) reply.header('Sunset', versao.sunsetEm.toUTCString());
    if (versao.sucessora) reply.header('Link', '<' + versao.sucessora + '>; rel="successor-version"');
  });
}
