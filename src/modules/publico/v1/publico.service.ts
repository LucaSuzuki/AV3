import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import type { Equipamento } from '../../../domain/entidades/Equipamento';
import type { Lote } from '../../../domain/entidades/Lote';
import { NaoEncontradoError } from '../../../shared/errors';
import { pagina, paginar } from '../../../shared/pagination';
import type { ContextoChaveApi } from '../../auth/chaves-api/chave-api.repository';
import { mapearEquipamento } from '../../equipamentos/equipamento.repository';
import type { FiltroEquipamento } from '../../equipamentos/equipamento.repository';
import { mapearLote } from '../../lotes/lote.repository';
import type { FiltroLote } from '../../lotes/lote.repository';
import type { LoteInput } from '../../lotes/lote.schemas';
import type { LoteService } from '../../lotes/lote.service';
import type { IdempotenciaService } from './idempotencia.service';

export type EntradaLotePublica = Omit<LoteInput, 'organizacaoId'>;

function equipamentoPublico(e: Equipamento) {
  const { id, codigoBarrasInterno, tipo, marca, modelo, anoFabricacao, estadoFisico, pesoQuilogramas, loteId, posicaoNoLote, statusRastreamento } = e;
  return { id, codigoBarrasInterno, tipo, marca, modelo, anoFabricacao, estadoFisico, pesoQuilogramas, loteId, posicaoNoLote, statusRastreamento };
}

function lotePublico(lote: Lote, detalhes: boolean) {
  const { id, notaFiscal, transportadora, dataEntrada, observacoes, statusProcessamento } = lote;
  return {
    id, notaFiscal, transportadora, dataEntrada, observacoes, statusProcessamento,
    ...(detalhes ? { equipamentos: lote.equipamentos.map(equipamentoPublico), pesoTotal: lote.calcularPesoTotal() } : {}),
  };
}

export class PublicoService {
  constructor(private db: PrismaClient, private lotes: LoteService, private idempotencia: IdempotenciaService) {}

  async listarEquipamentos(contexto: ContextoChaveApi, q: Pick<FiltroEquipamento, 'loteId' | 'tipo' | 'statusRastreamento' | 'page' | 'pageSize'>) {
    const { skip, take } = paginar(q);
    const where: Prisma.EquipamentoWhereInput = { lote: { organizacaoId: contexto.organizacaoId }, loteId: q.loteId, tipo: q.tipo, statusRastreamento: q.statusRastreamento };
    const [rows, total] = await Promise.all([
      this.db.equipamento.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
      this.db.equipamento.count({ where }),
    ]);
    return pagina(rows.map(e => equipamentoPublico(mapearEquipamento(e))), total, q);
  }

  async rastrear(contexto: ContextoChaveApi, codigoBarras: string) {
    const linha = await this.db.equipamento.findFirst({
      where: { codigoBarrasInterno: codigoBarras, lote: { organizacaoId: contexto.organizacaoId } },
      include: { movimentacoes: { orderBy: [{ dataHora: 'asc' }, { id: 'asc' }] } },
    });
    if (!linha) throw new NaoEncontradoError();
    return {
      equipamento: equipamentoPublico(mapearEquipamento(linha)),
      movimentacoes: linha.movimentacoes.map(({ dataHora, origem, destino, observacao }) => ({ dataHora, origem, destino, observacao })),
    };
  }

  async listarLotes(contexto: ContextoChaveApi, q: Omit<FiltroLote, 'organizacaoId'>) {
    const lotes = await this.lotes.listar({ ...q, organizacaoId: contexto.organizacaoId });
    return { ...lotes, items: lotes.items.map(({ id, notaFiscal, transportadora, dataEntrada, observacoes, statusProcessamento }) => ({ id, notaFiscal, transportadora, dataEntrada, observacoes, statusProcessamento })) };
  }

  async obterLote(contexto: ContextoChaveApi, id: string) {
    const linha = await this.db.lote.findFirst({
      where: { id, organizacaoId: contexto.organizacaoId }, include: { equipamentos: { orderBy: { posicaoNoLote: 'asc' } } },
    });
    if (!linha) throw new NaoEncontradoError();
    return lotePublico(mapearLote(linha), true);
  }

  criarLote(contexto: ContextoChaveApi, entrada: EntradaLotePublica, chave?: string) {
    return this.idempotencia.criar(contexto.parceiroId, chave, entrada, async db => {
      const lote = await this.lotes.criar({ ...entrada, organizacaoId: contexto.organizacaoId }, {
        sub: contexto.parceiroId, usuario: 'parceiro:' + contexto.parceiroNome, papel: 'PARCEIRO',
      }, db);
      return lotePublico(lote, true);
    });
  }
}
