import type { FastifyInstance } from 'fastify';
import type { FilaTrabalhos } from '../modules/fila/fila';
import { BullMQFila } from '../modules/fila/bullmq.fila';

declare module 'fastify' {
  interface FastifyInstance { fila: FilaTrabalhos; }
}

export function registrarFila(app: FastifyInstance, fila: FilaTrabalhos) {
  app.decorate('fila', fila);
  app.addHook('onClose', () => fila.fechar());
  app.get('/health/fila', { schema: { security: [] } }, async (_request, reply) => {
    if (!(fila instanceof BullMQFila)) return { status: 'ok', redis: 'desativado' };
    let limite: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, rejeitar) => { limite = setTimeout(() => rejeitar(new Error('Redis indisponível.')), 2500); });
      await Promise.race([fila.ping(), timeout]);
      return { status: 'ok', redis: 'up' };
    } catch {
      return reply.code(503).send({ status: 'degraded', redis: 'down' });
    } finally {
      clearTimeout(limite);
    }
  });
}
