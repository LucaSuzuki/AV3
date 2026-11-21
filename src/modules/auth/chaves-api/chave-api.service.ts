import type { EscopoApi, Prisma } from '../../../generated/prisma/client';
import { NaoAutorizadoError, NaoEncontradoError, RegraNegocioError, conferirVersao } from '../../../shared/errors';
import { hashesIguais } from '../../../shared/hash';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { ChaveApiRepository } from './chave-api.repository';
import type { ContextoChaveApi } from './chave-api.repository';
import { gerarChaveApi, parsearChaveApi } from './chave-api.util';

export interface EntradaChave { descricao: string; escopos: EscopoApi[]; limiteReqMin?: number; expiraEm?: string; }

export class ChaveApiService {
  private readonly usos = new Map<string, number>();

  constructor(private repo: ChaveApiRepository, private auditoria: AuditoriaService, private limitePadrao: number, private graceHoras: number) {}

  async autenticar(valor: unknown): Promise<ContextoChaveApi> {
    const parsed = parsearChaveApi(valor);
    const chave = parsed ? await this.repo.porPrefixo(parsed.prefixo) : null;
    const agora = new Date();
    if (!parsed || !chave || !hashesIguais(chave.hashChave, parsed.hashChave) ||
        !chave.ativa || chave.revogadaEm || (chave.expiraEm && chave.expiraEm <= agora) ||
        !chave.parceiro.ativo || !chave.parceiro.organizacao.ativo) {
      throw new NaoAutorizadoError('Chave de API inválida.');
    }
    const ultimoUso = this.usos.get(chave.id) ?? chave.ultimoUsoEm?.getTime() ?? 0;
    if (agora.getTime() - ultimoUso >= 60000) {
      this.usos.delete(chave.id);
      if (this.usos.size >= 10000) this.usos.delete(this.usos.keys().next().value!);
      this.usos.set(chave.id, agora.getTime());
      void this.repo.registrarUso(chave.id, agora).catch(() => this.usos.delete(chave.id));
    }
    return {
      id: chave.id, prefixo: chave.prefixo, parceiroId: chave.parceiroId, parceiroNome: chave.parceiro.nome,
      organizacaoId: chave.parceiro.organizacaoId, escopos: chave.escopos, limiteReqMin: chave.limiteReqMin,
    };
  }

  async listar(parceiroId: string) {
    return this.repo.transacao(async db => {
      await this.conferirParceiro(parceiroId, db, false);
      return this.repo.listar(parceiroId, db);
    });
  }

  async criar(parceiroId: string, entrada: EntradaChave, usuario: string) {
    const { expiraEm, ...campos } = entrada;
    const expiracao = expiraEm ? new Date(expiraEm) : null;
    if (expiracao && expiracao <= new Date()) throw new RegraNegocioError('A expiração da chave deve ser futura.');
    return this.repo.transacao(async db => {
      await this.conferirParceiro(parceiroId, db, true);
      const { chave, ...credencial } = gerarChaveApi();
      const criada = await this.repo.criar({ ...campos, ...credencial, parceiroId, expiraEm: expiracao, limiteReqMin: campos.limiteReqMin ?? this.limitePadrao }, db);
      await this.auditoria.registrar('CREATE_CHAVE', 'ChaveApi', criada.id, undefined, criada, usuario, db);
      return { ...criada, chave };
    });
  }

  revogar(id: string, versao: number, usuario: string) {
    return this.repo.transacao(async db => {
      const antes = await this.repo.porId(id, db);
      if (!antes) throw new NaoEncontradoError();
      conferirVersao(antes.versao, versao);
      if (antes.revogadaEm) return antes;
      const depois = await this.repo.atualizar(id, versao, { ativa: false, revogadaEm: new Date() }, db);
      await this.auditoria.registrar('REVOKE_CHAVE', 'ChaveApi', id, antes, depois, usuario, db);
      return depois;
    });
  }

  rotacionar(id: string, versao: number, usuario: string) {
    return this.repo.transacao(async db => {
      const antes = await this.repo.porId(id, db);
      if (!antes) throw new NaoEncontradoError();
      conferirVersao(antes.versao, versao);
      if (!antes.ativa || antes.revogadaEm || (antes.expiraEm && antes.expiraEm <= new Date())) throw new RegraNegocioError('Somente chaves ativas podem ser rotacionadas.');
      await this.conferirParceiro(antes.parceiroId, db, true);
      const grace = new Date(Date.now() + this.graceHoras * 3600000);
      const anterior = await this.repo.atualizar(id, versao, { expiraEm: antes.expiraEm && antes.expiraEm < grace ? antes.expiraEm : grace }, db);
      const { chave, ...credencial } = gerarChaveApi();
      const nova = await this.repo.criar({
        ...credencial, parceiroId: antes.parceiroId, descricao: antes.descricao, escopos: antes.escopos,
        limiteReqMin: antes.limiteReqMin, expiraEm: antes.expiraEm,
      }, db);
      await this.auditoria.registrar('ROTATE_CHAVE', 'ChaveApi', id, antes, { anterior, nova }, usuario, db);
      return { ...nova, chave };
    });
  }

  private async conferirParceiro(id: string, db: Prisma.TransactionClient, exigirAtivo: boolean) {
    const parceiro = await db.parceiro.findUnique({ where: { id }, include: { organizacao: { select: { ativo: true } } } });
    if (!parceiro) throw new NaoEncontradoError('Parceiro não encontrado.');
    if (exigirAtivo && (!parceiro.ativo || !parceiro.organizacao.ativo)) throw new RegraNegocioError('Parceiro ou organização inativa.');
  }
}
