import { TipoEquipamento } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/base.repository';
import type { PrismaClientOuTx } from '../../../shared/tipos';
import type { calcularVidaUtil } from './vida-util.calculos';

export class VidaUtilRepository extends BaseRepository {
  async consultar(organizacaoId: string | undefined, db: PrismaClientOuTx = this.prisma) {
    const equipamentos = await db.equipamento.findMany({
      where: { lote: { organizacaoId } },
      select: { id: true, tipo: true, anoFabricacao: true, estadoFisico: true, statusRastreamento: true, lote: { select: { dataEntrada: true } } },
    });
    return equipamentos.map(({ statusRastreamento, lote, ...item }) => ({
      ...item, baixado: statusRastreamento === 'BAIXA_DEFINITIVA', dataEntrada: lote.dataEntrada,
    }));
  }

  async salvar(execucaoId: string, resultado: ReturnType<typeof calcularVidaUtil<TipoEquipamento>>, db: PrismaClientOuTx = this.prisma) {
    await db.modeloVidaUtil.deleteMany({ where: { execucaoId } });
    const modelos = await db.modeloVidaUtil.createManyAndReturn({
      data: resultado.modelos.map(modelo => ({ ...modelo, execucaoId })),
      select: { chave: true, id: true },
    });
    const ids = new Map(modelos.map(({ chave, id }) => [chave, id]));
    for (let inicio = 0; inicio < resultado.previsoes.length; inicio += 1000) {
      const data = resultado.previsoes.slice(inicio, inicio + 1000).map(({ chaveModelo, ...previsao }) => ({
        ...previsao, execucaoId, modeloId: ids.get(chaveModelo)!,
      }));
      await db.previsaoVidaUtil.createMany({ data });
    }
  }
}
