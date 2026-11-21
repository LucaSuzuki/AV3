import type { PrismaClientOuTx } from '../../../shared/tipos';
import type { PeriodoAnalise, ServicoAnalitico } from '../servico-analitico';
import { calcularEficiencia } from './eficiencia.calculos';
import { EficienciaRepository } from './eficiencia.repository';

type Resultado = ReturnType<typeof calcularEficiencia> & { periodo: { inicio: string; fim: string } };

export class EficienciaService implements ServicoAnalitico<PeriodoAnalise, Resultado> {
  readonly tipo = 'EFICIENCIA';
  readonly versaoModelo = '1.0.0';

  constructor(private repo: EficienciaRepository, private minAmostra: number) {}

  async calcular(parametros: PeriodoAnalise, db: PrismaClientOuTx): Promise<Resultado> {
    const triagens = await this.repo.consultarTriagens(parametros, db);
    return {
      ...calcularEficiencia(triagens, this.minAmostra),
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
