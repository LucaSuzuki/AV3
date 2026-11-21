import { LoteRepository, FiltroLote } from './lote.repository';
import { LoteInput } from './lote.schemas';
import { OrganizacaoRepository } from '../organizacoes/organizacao.repository';
import { EquipamentoService } from '../equipamentos/equipamento.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Ator } from '../../shared/tipos';
import { NaoEncontradoError, RegraNegocioError, conferirVersao } from '../../shared/errors';
import { Prisma, StatusLote } from '../../generated/prisma/client';
import { transicoesLote, validarTransicao } from '../../domain/regras/transicoes';
import { ValidadorDataEntrada } from '../../domain/validators/ValidadorDataEntrada';

export class LoteService {
  constructor(private repo: LoteRepository, private orgs: OrganizacaoRepository, private equipamentos: EquipamentoService, private auditoria: AuditoriaService) {}
  listar(q: FiltroLote) { if (q.dataInicio && q.dataFim && new Date(q.dataInicio) > new Date(q.dataFim)) throw new RegraNegocioError('Período invertido.'); return this.repo.listar(q); }
  async obter(id: string) { const l = await this.repo.porId(id); if (!l) throw new NaoEncontradoError(); return { ...l, pesoTotal: l.calcularPesoTotal() }; }
  criar(dados: LoteInput, ator: Ator, transacao?: Prisma.TransactionClient) {
    const { equipamentos = [], ...campos } = dados;
    const dataEntrada = new Date(dados.dataEntrada ?? Date.now());
    const v = new ValidadorDataEntrada(); if (!v.validar(dataEntrada)) throw new RegraNegocioError(v.obterMensagemErro());
    const criar = async (db: Prisma.TransactionClient) => {
      const org = await this.orgs.porId(dados.organizacaoId, db); if (!org) throw new NaoEncontradoError('Organização não encontrada.');
      if (!org.ativo) throw new RegraNegocioError('Organização inativa não pode receber lotes.');
      const lote = await this.repo.criar({ ...campos, dataEntrada }, db);
      await db.transicaoLote.create({ data: { loteId: lote.id, statusNovo: 'RECEBIDO', usuario: ator.usuario, dataHora: dataEntrada } });
      for (const equipamento of equipamentos) await this.equipamentos.cadastrarNaTransacao(lote.id, equipamento, ator, db);
      const depois = (await this.repo.porId(lote.id, db))!;
      await this.auditoria.registrar('CREATE', 'Lote', lote.id, undefined, depois, ator.usuario, db);
      return depois;
    };
    const resultado = transacao ? criar(transacao) : this.repo.transacao(criar, true);
    return resultado.then(depois => Object.assign(depois, { pesoTotal: depois.calcularPesoTotal() }));
  }
  atualizar(id: string, dados: { transportadora?: string; observacoes?: string; versao: number }, ator: Ator) {
    return this.repo.transacao(async db => {
      const antes = await this.repo.porId(id, db); if (!antes) throw new NaoEncontradoError();
      const { versao, ...campos } = dados;
      const depois = await this.repo.atualizar(id, versao, campos, db);
      await this.auditoria.registrar('UPDATE', 'Lote', id, antes, depois, ator.usuario, db); return depois;
    });
  }
  transicionar(id: string, status: StatusLote, versao: number, ator: Ator) {
    return this.repo.transacao(async db => {
      const antes = await this.repo.porId(id, db); if (!antes) throw new NaoEncontradoError();
      conferirVersao(antes.versao, versao);
      validarTransicao(transicoesLote, antes.statusProcessamento, status);
      if (status === 'TRIAGEM_CONCLUIDA' && antes.equipamentos.length === 0) throw new RegraNegocioError('Triagem exige pelo menos um equipamento.');
      if (status === 'ENCAMINHADO' && antes.equipamentos.some(e => ['AGUARDANDO_DESMONTE', 'EM_DESMONTE'].includes(e.statusRastreamento))) throw new RegraNegocioError('Finalize os desmontes antes de encaminhar o lote.');
      const depois = await this.repo.atualizar(id, versao, { statusProcessamento: status }, db);
      await db.transicaoLote.create({ data: { loteId: id, statusAnterior: antes.statusProcessamento, statusNovo: status, usuario: ator.usuario } });
      await this.auditoria.registrar('UPDATE_STATUS', 'Lote', id, antes, depois, ator.usuario, db); return depois;
    }, true);
  }
}
