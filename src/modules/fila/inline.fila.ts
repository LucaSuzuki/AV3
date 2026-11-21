import { randomUUID } from 'node:crypto';
import { setTimeout as esperar, setImmediate as proximoTurno } from 'node:timers/promises';
import type { FilaTrabalhos, ProcessarTrabalho } from './fila';
import type { NomeJob, PayloadJob, Trabalho } from './jobs';
import { recuperavel } from './erros';
import { atrasoRetry } from './politica';

export class FilaInline implements FilaTrabalhos {
  private fechada = false;
  private readonly ativos = new Map<string, Promise<void>>();

  constructor(private processar: ProcessarTrabalho, private tentativas: number, private backoffMs: number) {}

  async enfileirar<N extends NomeJob>(nome: N, dados: PayloadJob[N], opcoes: { atrasoMs?: number; jobId?: string } = {}) {
    if (this.fechada) throw new Error('Fila encerrada.');
    const jobId = opcoes.jobId ?? randomUUID();
    if (!this.ativos.has(jobId)) {
      const execucao = this.executar({ nome, dados } as Trabalho, opcoes.atrasoMs).finally(() => this.ativos.delete(jobId));
      this.ativos.set(jobId, execucao);
    }
    return { jobId };
  }

  private async executar(trabalho: Trabalho, atrasoMs = 0) {
    if (atrasoMs) await esperar(atrasoMs);
    else await proximoTurno();
    for (let tentativa = 1; tentativa <= this.tentativas; tentativa++) {
      try {
        await this.processar(trabalho, tentativa);
        return;
      } catch (erro) {
        if (!recuperavel(erro) || tentativa === this.tentativas) return;
        await esperar(atrasoRetry(this.backoffMs, tentativa));
      }
    }
  }

  async aguardarOciosa() {
    while (this.ativos.size) await Promise.all(this.ativos.values());
  }

  async fechar() {
    this.fechada = true;
    await this.aguardarOciosa();
  }
}
