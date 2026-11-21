import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import IORedis from 'ioredis';
import type { Config } from '../config/env';
import { AppError } from '../shared/errors';

export async function registrarLimite(app: FastifyInstance, config: Config) {
  const redis = config.redisUrl && config.queueMode !== 'inline' ? new IORedis(config.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2000, lazyConnect: true }) : undefined;
  if (redis) {
    redis.on('error', () => app.log.warn('Redis indisponível para o limite de requisições.'));
    app.addHook('onClose', async () => { redis.disconnect(); });
  }
  await app.register(rateLimit, {
    hook: 'preHandler',
    max: req => req.chaveApi?.limiteReqMin ?? 200,
    keyGenerator: req => req.chaveApi ? 'chave:' + req.chaveApi.id : req.ip,
    timeWindow: '1 minute',
    redis,
    skipOnError: true,
    errorResponseBuilder: () => new AppError(429, 'LIMITE_EXCEDIDO', 'Limite de requisições excedido.'),
  });
}
