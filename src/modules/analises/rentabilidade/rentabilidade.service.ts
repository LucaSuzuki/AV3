import type { TipoEquipamento } from '../../../generated/prisma/client';
import type { PrismaClientOuTx } from '../../../shared/tipos';
import type { PeriodoAnalise, ServicoAnalitico } from '../servico-analitico';
import { calcularRentabilidade } from './rentabilidade.calculos';
import { RentabilidadeRepository } from './rentabilidade.repository';

type Resultado = ReturnType<typeof calcularRentabilidade<TipoEquipamento>> & { periodo: { inicio: string; fim: string } };

export class RentabilidadeService implements ServicoAnalitico<PeriodoAnalise, Resultado> {
  readonly tipo = 'RENTABILIDADE';
  readonly versaoModelo = '1.0.0';

  constructor(private repo: RentabilidadeRepository) {}

  async calcular(parametros: PeriodoAnalise, db: PrismaClientOuTx): Promise<Resultado> {
    const { itens, parametros: valores } = await this.repo.consultar(parametros, db);
    return {
      ...calcularRentabilidade(itens, valores),
      periodo: { inicio: parametros.inicio.toISOString(), fim: parametros.fim.toISOString() },
    };
  }

  persistir(execucaoId: string, resultado: Resultado, db: PrismaClientOuTx) {
    return this.repo.salvarMetricas(execucaoId, resultado.metricas, db);
  }

  resumo(resultado: Resultado) {
    return { periodo: resultado.periodo, ...resultado.resumo };
  }
}
