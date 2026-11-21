import { registrarFila } from './plugins/fila';
import { BullMQFila, iniciarWorker } from './modules/fila/bullmq.fila';
import { FilaInline } from './modules/fila/inline.fila';
import type { ProcessarTrabalho } from './modules/fila/fila';
import { registrarAgendamento } from './modules/fila/agendador';
import Fastify from 'fastify';
import { lerEnv, Config } from './config/env';
import { registrarSwagger } from './plugins/swagger';
import { registrarErros } from './plugins/error-handler';
import { criarPrisma, registrarPrisma } from './plugins/prisma';
import { PrismaClient } from './generated/prisma/client';
import { BaseRepository } from './shared/base.repository';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { registrarLimite } from './plugins/rate-limit-publico';
import { registrarAuth } from './plugins/auth';
import { criarContainer } from './container';
import { registrarRotas } from './routes';

export async function buildApp(options: { config?: Config; logger?: boolean; prisma?: PrismaClient } = {}) {
  const config = options.config ?? lerEnv();
  const app = Fastify({ bodyLimit: 1048576, ajv: { customOptions: { removeAdditional: false, multipleOfPrecision: 8 } }, logger: options.logger === false ? false : {
    level: config.logLevel,
    redact: ['req.headers.authorization', 'req.headers[\'x-api-key\']', 'chave', 'hashChave', 'senha', 'senhaAtual', 'senhaNova', 'hashSenha', '*.senha', '*.hashSenha'],
  } });
  registrarErros(app);
  registrarPrisma(app, options.prisma ?? criarPrisma(config.databaseUrl));
  await registrarSwagger(app);
  await app.register(cors, { origin: config.corsOrigin });
  await app.register(helmet);
  await registrarLimite(app, config);
  await registrarAuth(app, config.jwtSecret);
  let processar: ProcessarTrabalho;
  const fila = config.queueMode === 'bullmq'
    ? new BullMQFila(config.redisUrl!, config.jobMaxTentativas, config.jobBackoffMs)
    : new FilaInline((trabalho, tentativa) => processar(trabalho, tentativa), config.jobMaxTentativas, config.jobBackoffMs);
  const container = criarContainer({ config, prisma: app.prisma, jwt: app.jwt, fila });
  processar = container.processar;
  if (config.workerEmbedded && fila instanceof BullMQFila) {
    const runtime = iniciarWorker(config.redisUrl!, processar, config.workerConcurrency);
    runtime.worker.on('error', () => app.log.error('Erro no worker integrado.'));
    app.addHook('onClose', () => runtime.fechar());
    await registrarAgendamento(fila, config);
  }
  registrarFila(app, fila);
  registrarRotas(app, container);
  app.get('/health', { schema: { security: [], response: { '2xx': { type: 'object', properties: { status: { type: 'string' }, db: { type: 'string' } } }, '5xx': { type: 'object', properties: { status: { type: 'string' }, db: { type: 'string' } } } } } }, async (_req, reply) => {
    try { await new BaseRepository(app.prisma).saudavel(); return { status: 'ok', db: 'up' }; }
    catch { return reply.code(503).send({ status: 'degraded', db: 'down' }); }
  });
  return app;
}
