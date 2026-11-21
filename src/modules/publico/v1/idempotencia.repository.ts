import type { Prisma } from '../../../generated/prisma/client';
import { BaseRepository } from '../../../shared/base.repository';
import type { PrismaClientOuTx } from '../../../shared/tipos';

export class IdempotenciaRepository extends BaseRepository {
  reservar(parceiroId: string, chave: string, hashCorpo: string, expiraEm: Date, db: PrismaClientOuTx = this.prisma) {
    return db.chaveIdempotencia.createMany({ data: { parceiroId, chave, hashCorpo, expiraEm }, skipDuplicates: true });
  }

  porChave(parceiroId: string, chave: string, db: PrismaClientOuTx = this.prisma) {
    return db.chaveIdempotencia.findUnique({ where: { parceiroId_chave: { parceiroId, chave } } });
  }

  removerExpirada(parceiroId: string, chave: string, agora: Date, db: PrismaClientOuTx = this.prisma) {
    return db.chaveIdempotencia.deleteMany({ where: { parceiroId, chave, expiraEm: { lte: agora } } });
  }

  concluir(id: string, corpoResposta: Prisma.InputJsonObject, db: PrismaClientOuTx = this.prisma) {
    return db.chaveIdempotencia.update({ where: { id }, data: { statusResposta: 201, corpoResposta } });
  }

  liberar(id: string, db: PrismaClientOuTx = this.prisma) {
    return db.chaveIdempotencia.deleteMany({ where: { id, statusResposta: 0 } });
  }
}
