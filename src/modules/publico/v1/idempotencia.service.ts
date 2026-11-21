import type { Prisma } from '../../../generated/prisma/client';
import { AppError } from '../../../shared/errors';
import { sha256 } from '../../../shared/hash';
import { IdempotenciaRepository } from './idempotencia.repository';

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonico(v)]));
  }
  return valor;
}

export class IdempotenciaService {
  constructor(private repo: IdempotenciaRepository, private ttlHoras: number) {}

  async criar<T extends { id: string }>(parceiroId: string, chave: string | undefined, entrada: unknown, executar: (db?: Prisma.TransactionClient) => Promise<T>) {
    if (!chave) return { corpo: await executar(), replay: false };
    const hashCorpo = sha256(JSON.stringify(canonico(entrada)));
    const agora = new Date();
    const reserva = await this.repo.transacao(async db => {
      await this.repo.removerExpirada(parceiroId, chave, agora, db);
      const nova = await this.repo.reservar(parceiroId, chave, hashCorpo, new Date(agora.getTime() + this.ttlHoras * 3600000), db);
      const registro = await this.repo.porChave(parceiroId, chave, db);
      if (!registro) throw new AppError(409, 'IDEMPOTENCIA_EM_ANDAMENTO', 'A requisição está em andamento.');
      return { registro, criada: nova.count === 1 };
    });
    if (!reserva.criada) {
      if (reserva.registro.hashCorpo !== hashCorpo) throw new AppError(409, 'IDEMPOTENCIA_CONFLITO', 'Já existe outra requisição com esta chave de idempotência.');
      if (!reserva.registro.statusResposta) throw new AppError(409, 'IDEMPOTENCIA_EM_ANDAMENTO', 'A requisição está em andamento.');
      return { corpo: reserva.registro.corpoResposta as unknown as T, replay: true };
    }
    try {
      const corpo = await this.repo.transacao(async db => {
        const criado = await executar(db);
        await this.repo.concluir(reserva.registro.id, JSON.parse(JSON.stringify(criado)) as Prisma.InputJsonObject, db);
        return criado;
      }, true);
      return { corpo, replay: false };
    } catch (erro) {
      await this.repo.liberar(reserva.registro.id);
      throw erro;
    }
  }
}
