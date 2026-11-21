import type { Prisma } from '../../generated/prisma/client';
import { BaseRepository } from '../../shared/base.repository';
import { pagina, paginar } from '../../shared/pagination';
import type { Paginacao } from '../../shared/pagination';
import type { PrismaClientOuTx } from '../../shared/tipos';

export interface FiltroParceiro extends Paginacao { ativo?: boolean; q?: string; }

export class ParceiroRepository extends BaseRepository {
  porId(id: string, db: PrismaClientOuTx = this.prisma) {
    return db.parceiro.findUnique({ where: { id } });
  }
  criar(data: Prisma.ParceiroUncheckedCreateInput, db: PrismaClientOuTx = this.prisma) {
    return db.parceiro.create({ data });
  }
  async listar(q: FiltroParceiro, db: PrismaClientOuTx = this.prisma) {
    const { skip, take } = paginar(q);
    const where: Prisma.ParceiroWhereInput = { ativo: q.ativo, nome: q.q ? { contains: q.q, mode: 'insensitive' } : undefined };
    const [items, total] = await Promise.all([
      db.parceiro.findMany({ where, skip, take, orderBy: [{ nome: 'asc' }, { id: 'asc' }] }),
      db.parceiro.count({ where }),
    ]);
    return pagina(items, total, q);
  }
  async atualizar(id: string, versao: number, dados: { contatoEmail?: string; ativo?: boolean }, db: PrismaClientOuTx = this.prisma) {
    const { count } = await db.parceiro.updateMany({ where: { id, versao }, data: { ...dados, versao: { increment: 1 } } });
    await this.conferirUpdate(count, () => this.porId(id, db));
    return (await this.porId(id, db))!;
  }
}
