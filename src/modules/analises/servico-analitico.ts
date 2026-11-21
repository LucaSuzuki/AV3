import type { TipoAnalise } from '../../generated/prisma/client';
import type { PrismaClientOuTx } from '../../shared/tipos';

export interface PeriodoAnalise {
  inicio: Date;
  fim: Date;
  organizacaoId?: string;
}

export interface ServicoAnalitico<P, R> {
  readonly tipo: TipoAnalise;
  readonly versaoModelo: string;
  calcular(parametros: P, db: PrismaClientOuTx): Promise<R>;
  persistir(execucaoId: string, resultado: R, db: PrismaClientOuTx): Promise<void>;
  resumo(resultado: R): Record<string, unknown>;
}
