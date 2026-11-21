import { lerEnv } from './config/env';
import { criarPrisma } from './plugins/prisma';
import { criarContainer } from './container';
import { BullMQFila, iniciarWorker } from './modules/fila/bullmq.fila';
import { registrarAgendamento } from './modules/fila/agendador';

async function main() {
  const config = lerEnv();
  if (config.queueMode !== 'bullmq' || !config.redisUrl) throw new Error('O worker exige QUEUE_MODE=bullmq e REDIS_URL.');
  const prisma = criarPrisma(config.databaseUrl);
  const fila = new BullMQFila(config.redisUrl, config.jobMaxTentativas, config.jobBackoffMs);
  const container = criarContainer({ config, prisma, fila });
  const runtime = iniciarWorker(config.redisUrl, container.processar, config.workerConcurrency);
  runtime.worker.on('error', () => console.error('Falha na conexão ou no processamento da fila.'));
  let encerrando = false;
  async function encerrar(codigo: number) {
    if (encerrando) return;
    encerrando = true;
    const limite = setTimeout(() => process.exit(1), config.shutdownTimeoutMs);
    limite.unref();
    try {
      await runtime.fechar();
      await Promise.all([fila.fechar(), prisma.$disconnect()]);
      process.exitCode = codigo;
    } finally {
      clearTimeout(limite);
    }
  }
  const sinais: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  if (process.platform === 'win32') sinais.push('SIGBREAK');
  sinais.forEach(sinal => process.once(sinal, () => { void encerrar(0).catch(() => process.exit(1)); }));
  try {
    await registrarAgendamento(fila, config);
    console.log('Worker Greencode pronto.');
  } catch (erro) {
    await encerrar(1);
    throw erro;
  }
}

void main().catch(erro => { console.error(erro instanceof Error ? erro.message : 'Falha ao iniciar worker.'); process.exitCode = 1; });
