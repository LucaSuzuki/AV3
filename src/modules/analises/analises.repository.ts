import type { Prisma } from '../../generated/prisma/client';
import { BaseRepository } from '../../shared/base.repository';
import type { PrismaClientOuTx } from '../../shared/tipos';

export class AnalisesRepository extends BaseRepository {
  porId(id: string, db: PrismaClientOuTx = this.prisma) {
    return db.execucaoAnalise.findUnique({ where: { id } });
  }

  criar(data: Prisma.ExecucaoAnaliseUncheckedCreateInput, db: PrismaClientOuTx = this.prisma) {
    return db.execucaoAnalise.create({ data });
  }

  async atualizar(id: string, versao: number, data: Prisma.ExecucaoAnaliseUpdateManyMutationInput, db: PrismaClientOuTx = this.prisma) {
    const { count } = await db.execucaoAnalise.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } });
    await this.conferirUpdate(count, () => this.porId(id, db));
    return (await this.porId(id, db))!;
  }
}
