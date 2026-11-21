import { Queue, UnrecoverableError, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { FilaTrabalhos, ProcessarTrabalho } from './fila';
import type { NomeJob, PayloadJob, Trabalho } from './jobs';
import { retencaoJobs } from './politica';
import { mensagemSegura, recuperavel } from './erros';

const nomeFila = 'greencode';

export class BullMQFila implements FilaTrabalhos {
  readonly queue: Queue;
  private readonly redis: IORedis;

  constructor(url: string, tentativas: number, backoffMs: number) {
    this.redis = new IORedis(url, { maxRetriesPerRequest: 2, connectTimeout: 2000, lazyConnect: true });
    this.queue = new Queue(nomeFila, { connection: this.redis, defaultJobOptions: {
      ...retencaoJobs, attempts: tentativas, backoff: { type: 'exponential', delay: backoffMs, jitter: 0.25 },
    } });
  }

  async enfileirar<N extends NomeJob>(nome: N, dados: PayloadJob[N], opcoes: { atrasoMs?: number; jobId?: string } = {}) {
    const job = await this.queue.add(nome, dados, { delay: opcoes.atrasoMs, jobId: opcoes.jobId });
    return { jobId: job.id! };
  }

  async ping() {
    return this.redis.ping();
  }

  async fechar() {
    await this.queue.close();
    this.redis.disconnect();
  }
}

export function iniciarWorker(url: string, processar: ProcessarTrabalho, concorrencia: number) {
  const redis = new IORedis(url, { maxRetriesPerRequest: null });
  const worker = new Worker(nomeFila, async job => {
    try {
      await processar({ nome: job.name, dados: job.data } as Trabalho, job.attemptsMade + 1);
    } catch (erro) {
      if (!recuperavel(erro)) throw new UnrecoverableError(mensagemSegura(erro));
      throw new Error(mensagemSegura(erro));
    }
  }, { connection: redis, concurrency: concorrencia, lockDuration: 60000 });
  return {
    worker,
    async fechar() {
      await worker.close();
      redis.disconnect();
    },
  };
}
