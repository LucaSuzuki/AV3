import type { NomeJob, PayloadJob, Trabalho } from './jobs';

export interface FilaTrabalhos {
  enfileirar<N extends NomeJob>(nome: N, dados: PayloadJob[N], opcoes?: { atrasoMs?: number; jobId?: string }): Promise<{ jobId: string }>;
  fechar(): Promise<void>;
}

export type ProcessarTrabalho = (trabalho: Trabalho, tentativa: number) => Promise<void>;
