import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { EscopoApi } from '../../../generated/prisma/client';
import { AppError, NaoAutorizadoError } from '../../../shared/errors';
import type { ContextoChaveApi } from './chave-api.repository';
import type { ChaveApiService } from './chave-api.service';

declare module 'fastify' {
  interface FastifyRequest { chaveApi?: ContextoChaveApi; }
}

export function registrarChaveApi(app: FastifyInstance, service: ChaveApiService) {
  app.decorateRequest('chaveApi', undefined);
  const limitarInvalidas = app.createRateLimit({ keyGenerator: request => 'chave-invalida:' + request.ip });
  app.addHook('onRequest', async (request, reply) => {
    try {
      request.chaveApi = await service.autenticar(request.headers['x-api-key']);
    } catch (erro) {
      if (erro instanceof NaoAutorizadoError) {
        const limite = await limitarInvalidas(request);
        if (!limite.isAllowed && limite.isExceeded) {
          reply.header('retry-after', limite.ttlInSeconds);
          throw new AppError(429, 'LIMITE_EXCEDIDO', 'Limite de requisições excedido.');
        }
      }
      throw erro;
    }
  });
}

export function exigirEscopo(escopo: EscopoApi) {
  return async (request: FastifyRequest) => {
    if (!request.chaveApi?.escopos.includes(escopo)) {
      throw new AppError(403, 'ESCOPO_INSUFICIENTE', 'A chave precisa do escopo ' + escopo + '.');
    }
  };
}
