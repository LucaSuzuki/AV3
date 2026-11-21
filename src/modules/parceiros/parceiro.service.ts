import { NaoEncontradoError, RegraNegocioError, conferirVersao } from '../../shared/errors';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ParceiroRepository } from './parceiro.repository';
import type { FiltroParceiro } from './parceiro.repository';

export interface EntradaParceiro { nome: string; organizacaoId: string; contatoEmail: string; }
export interface MudancaParceiro { contatoEmail?: string; ativo?: boolean; versao: number; }

export class ParceiroService {
  constructor(private repo: ParceiroRepository, private auditoria: AuditoriaService) {}

  listar(q: FiltroParceiro) { return this.repo.listar(q); }

  async obter(id: string) {
    const parceiro = await this.repo.porId(id);
    if (!parceiro) throw new NaoEncontradoError('Parceiro não encontrado.');
    return parceiro;
  }

  criar(dados: EntradaParceiro, usuario: string) {
    return this.repo.transacao(async db => {
      const org = await db.organizacao.findUnique({ where: { id: dados.organizacaoId }, select: { ativo: true } });
      if (!org) throw new NaoEncontradoError('Organização não encontrada.');
      if (!org.ativo) throw new RegraNegocioError('Organização inativa.');
      const parceiro = await this.repo.criar(dados, db);
      await this.auditoria.registrar('CREATE_PARCEIRO', 'Parceiro', parceiro.id, undefined, parceiro, usuario, db);
      return parceiro;
    });
  }

  atualizar(id: string, dados: MudancaParceiro, usuario: string) {
    return this.repo.transacao(async db => {
      const antes = await this.repo.porId(id, db);
      if (!antes) throw new NaoEncontradoError('Parceiro não encontrado.');
      const { versao, ...campos } = dados;
      conferirVersao(antes.versao, versao);
      const depois = await this.repo.atualizar(id, versao, campos, db);
      await this.auditoria.registrar('UPDATE_PARCEIRO', 'Parceiro', id, antes, depois, usuario, db);
      return depois;
    });
  }
}
