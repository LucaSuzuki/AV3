import type { TipoEquipamento } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/base.repository';
import type { PrismaClientOuTx } from '../../../shared/tipos';
import type { PeriodoAnalise } from '../servico-analitico';
import type { calcularRentabilidade, ParametroValor } from './rentabilidade.calculos';

export class RentabilidadeRepository extends BaseRepository {
  async consultar({ inicio, fim, organizacaoId }: PeriodoAnalise, db: PrismaClientOuTx = this.prisma) {
    const [equipamentos, linhasParametros] = await Promise.all([
      db.equipamento.findMany({
        where: { lote: { organizacaoId, dataEntrada: { gte: inicio, lte: fim } } },
        select: { tipo: true, estadoFisico: true, marca: true, modelo: true, pesoQuilogramas: true, valorRecuperadoReal: true },
      }),
      db.parametroRecuperacao.findMany(),
    ]);
    const parametros = new Map<TipoEquipamento, ParametroValor>();
    for (const { tipo, valorBaseKg, fatoresEstado } of linhasParametros) {
      if (!Array.isArray(fatoresEstado) || !fatoresEstado.every((fator): fator is number => typeof fator === 'number')) {
        throw new Error('Parâmetro de recuperação contém fatores inválidos.');
      }
      parametros.set(tipo, { valorBaseKg: valorBaseKg.toNumber(), fatoresEstado });
    }
    return {
      parametros,
      itens: equipamentos.map(({ pesoQuilogramas, valorRecuperadoReal, ...campos }) => ({
        ...campos, peso: pesoQuilogramas.toNumber(), realizado: valorRecuperadoReal?.toNumber() ?? null,
      })),
    };
  }

  async salvarMetricas(execucaoId: string, metricas: ReturnType<typeof calcularRentabilidade<TipoEquipamento>>['metricas'], db: PrismaClientOuTx = this.prisma) {
    await db.metricaRentabilidade.deleteMany({ where: { execucaoId } });
    await db.metricaRentabilidade.createMany({ data: metricas.map(metrica => ({ ...metrica, execucaoId })) });
  }
}
