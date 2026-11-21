import { Prisma, TipoEquipamento } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/base.repository';

export class AvaliacaoPrevisoesService extends BaseRepository {
  avaliar() {
    return this.transacao(db => db.$executeRaw`
      WITH realizadas AS (
        SELECT p.id, MIN(m."dataHora") AS realizada
        FROM previsoes_vida_util p
        JOIN equipamentos e ON e.id = p."equipamentoId" AND e."estadoFisico" = 6
        JOIN movimentacoes m ON m."equipamentoId" = e.id AND m.destino = '6' AND m.origem ~ '^[0-5]$'
        WHERE p."avaliadaEm" IS NULL
        GROUP BY p.id
      )
      UPDATE previsoes_vida_util p
      SET "realizadoEm" = r.realizada,
          "erroDias" = ROUND(EXTRACT(EPOCH FROM (r.realizada - p."dataPrevistaInservivel")) / 86400)::int,
          "avaliadaEm" = NOW(), versao = versao + 1
      FROM realizadas r
      WHERE p.id = r.id AND r.realizada > p."geradoEm" AND p."avaliadaEm" IS NULL
    `);
  }

  async acuracia(filtros: { tipo?: TipoEquipamento; inicio?: string; fim?: string }) {
    const filtroTipo = filtros.tipo ? Prisma.sql`AND e.tipo = ${filtros.tipo}::"TipoEquipamento"` : Prisma.empty;
    const filtroInicio = filtros.inicio ? Prisma.sql`AND p."geradoEm" >= ${new Date(filtros.inicio)}` : Prisma.empty;
    const filtroFim = filtros.fim ? Prisma.sql`AND p."geradoEm" <= ${new Date(filtros.fim)}` : Prisma.empty;
    type Linha = { tipo: TipoEquipamento | null; amostra: number; maeDias: number | null; viesDias: number | null; pendentes: number };
    const linhas = await this.prisma.$queryRaw<Linha[]>(Prisma.sql`
      SELECT e.tipo, COUNT(p."erroDias")::int AS amostra,
             AVG(ABS(p."erroDias"))::float8 AS "maeDias", AVG(p."erroDias")::float8 AS "viesDias",
             COUNT(*) FILTER (WHERE p."avaliadaEm" IS NULL)::int AS pendentes
      FROM previsoes_vida_util p
      JOIN equipamentos e ON e.id = p."equipamentoId"
      WHERE true ${filtroTipo} ${filtroInicio} ${filtroFim}
      GROUP BY GROUPING SETS ((), (e.tipo))
      ORDER BY e.tipo NULLS FIRST
    `);
    const [geral, ...porTipo] = linhas;
    return { amostra: geral.amostra, maeDias: geral.maeDias, viesDias: geral.viesDias, pendentes: geral.pendentes, porTipo };
  }
}
