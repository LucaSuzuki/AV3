import type { EscopoApi, Prisma } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/base.repository';
import type { PrismaClientOuTx } from '../../../shared/tipos';

export const metadadosChave = {
  id: true, parceiroId: true, prefixo: true, descricao: true, escopos: true, limiteReqMin: true,
  ativa: true, expiraEm: true, revogadaEm: true, ultimoUsoEm: true, criadoEm: true, versao: true,
} as const;

export interface ContextoChaveApi {
  id: string;
  prefixo: string;
  parceiroId: string;
  parceiroNome: string;
  organizacaoId: string;
  escopos: EscopoApi[];
  limiteReqMin: number;
}

export class ChaveApiRepository extends BaseRepository {
  porPrefixo(prefixo: string, db: PrismaClientOuTx = this.prisma) {
    return db.chaveApi.findUnique({ where: { prefixo }, include: {
      parceiro: { include: { organizacao: { select: { ativo: true } } } },
    } });
  }
  porId(id: string, db: PrismaClientOuTx = this.prisma) {
    return db.chaveApi.findUnique({ where: { id }, select: metadadosChave });
  }
  listar(parceiroId: string, db: PrismaClientOuTx = this.prisma) {
    return db.chaveApi.findMany({ where: { parceiroId }, select: metadadosChave, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }] });
  }
  criar(data: Prisma.ChaveApiUncheckedCreateInput, db: PrismaClientOuTx = this.prisma) {
    return db.chaveApi.create({ data, select: metadadosChave });
  }
  async atualizar(id: string, versao: number, data: Prisma.ChaveApiUpdateManyMutationInput, db: PrismaClientOuTx = this.prisma) {
    const { count } = await db.chaveApi.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } });
    await this.conferirUpdate(count, () => this.porId(id, db));
    return (await this.porId(id, db))!;
  }
  registrarUso(id: string, agora: Date, db: PrismaClientOuTx = this.prisma) {
    return db.chaveApi.updateMany({
      where: { id, OR: [{ ultimoUsoEm: null }, { ultimoUsoEm: { lte: new Date(agora.getTime() - 60000) } }] },
      data: { ultimoUsoEm: agora },
    });
  }
}
