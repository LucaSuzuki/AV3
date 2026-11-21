import { Prisma } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/base.repository';
import type { PrismaClientOuTx } from '../../../shared/tipos';
import type { PeriodoAnalise } from '../servico-analitico';
import type { Triagem, calcularEficiencia } from './eficiencia.calculos';

export class EficienciaRepository extends BaseRepository {
  consultarTriagens({ inicio, fim, organizacaoId }: PeriodoAnalise, db: PrismaClientOuTx = this.prisma) {
    const filtroTenant = organizacaoId ? Prisma.sql`AND l."organizacaoId" = ${organizacaoId}::uuid` : Prisma.empty;
    return db.$queryRaw<Triagem[]>(Prisma.sql`
      SELECT l."dataEntrada" AS entrada, i.inicio, c."dataHora" AS conclusao, c.usuario AS operador
      FROM lotes l
      JOIN LATERAL (
        SELECT t."dataHora", t.usuario
        FROM transicoes_lote t
        WHERE t."loteId" = l.id AND t."statusNovo" = 'TRIAGEM_CONCLUIDA'
        ORDER BY t."dataHora", t.id
        LIMIT 1
      ) c ON true
      LEFT JOIN LATERAL (
        SELECT MIN(t."dataHora") AS inicio
        FROM transicoes_lote t
        WHERE t."loteId" = l.id AND t."statusNovo" = 'EM_TRIAGEM'
      ) i ON true
      WHERE c."dataHora" >= ${inicio} AND c."dataHora" <= ${fim} ${filtroTenant}
      ORDER BY c."dataHora", l.id
    `);
  }

  async salvarMetricas(execucaoId: string, metricas: ReturnType<typeof calcularEficiencia>['metricas'], db: PrismaClientOuTx = this.prisma) {
    await db.metricaEficiencia.deleteMany({ where: { execucaoId } });
    await db.metricaEficiencia.createMany({ data: metricas.map(metrica => ({ ...metrica, execucaoId })) });
  }
}
