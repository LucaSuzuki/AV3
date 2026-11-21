import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import IORedis from 'ioredis';
import { BullMQFila, iniciarWorker } from '../../src/modules/fila/bullmq.fila';
import { ErroNaoRecuperavel } from '../../src/modules/fila/erros';
import { lerEnv } from '../../src/config/env';
import { registrarAgendamento } from '../../src/modules/fila/agendador';

const url = process.env.REDIS_URL_TEST;

test('BullMQ executa retries reais, respeita erro definitivo e mantém agendamentos únicos', async () => {
  if (!url) { console.warn('REDIS_URL_TEST ausente. Verificação BullMQ ignorada.'); return; }
  if (new URL(url).pathname !== '/1' || url === process.env.REDIS_URL) throw new Error('REDIS_URL_TEST deve usar o banco Redis 1, separado da aplicação.');
  const redis = new IORedis(url, { lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 0, retryStrategy: () => null });
  redis.on('error', () => {});
  try { await redis.ping(); }
  catch { console.warn('Redis de teste indisponível. Verificação BullMQ ignorada.'); return; }
  finally { redis.disconnect(); }
  const fila = new BullMQFila(url, 3, 30);
  const idRetry = randomUUID();
  const idDefinitivo = randomUUID();
  const tentativas: number[] = [];
  const falhas: number[] = [];
  const runtime = iniciarWorker(url, async (trabalho, tentativa) => {
    if (trabalho.nome !== 'analise.executar') return;
    if (trabalho.dados.execucaoId === idRetry) {
      tentativas.push(tentativa);
      if (tentativa < 3) throw new Error('Falha transitória.');
    }
    if (trabalho.dados.execucaoId === idDefinitivo) {
      falhas.push(tentativa);
      throw new ErroNaoRecuperavel('Entrada inválida.');
    }
  }, 2);
  runtime.worker.on('error', () => {});
  try {
    const config = lerEnv({ ...process.env, NODE_ENV: 'test', QUEUE_MODE: 'inline' });
    await registrarAgendamento(fila, config);
    await registrarAgendamento(fila, config);
    const agendadores = await fila.queue.getJobSchedulers();
    expect(agendadores.filter(a => ['analises-diarias', 'limpeza-diaria', 'reconciliacao'].includes(a.key))).toHaveLength(3);
    await fila.enfileirar('analise.executar', { execucaoId: idRetry }, { jobId: idRetry });
    await fila.enfileirar('analise.executar', { execucaoId: idDefinitivo }, { jobId: idDefinitivo });
    const limite = Date.now() + 8000;
    while (Date.now() < limite) {
      const estados = await Promise.all([fila.queue.getJobState(idRetry), fila.queue.getJobState(idDefinitivo)]);
      if (estados[0] === 'completed' && estados[1] === 'failed') break;
      await esperar(25);
    }
    expect(await fila.queue.getJobState(idRetry)).toBe('completed');
    expect(await fila.queue.getJobState(idDefinitivo)).toBe('failed');
    expect(tentativas).toEqual([1, 2, 3]);
    expect(falhas).toEqual([1]);
  } finally {
    await runtime.fechar();
    for (const id of ['analises-diarias', 'limpeza-diaria', 'reconciliacao']) await fila.queue.removeJobScheduler(id);
    for (const id of [idRetry, idDefinitivo, 'reconciliacao-inicial']) await fila.queue.remove(id);
    await fila.fechar();
  }
}, 20000);
