import { TipoEquipamento } from '../../../generated/prisma/client';
import type { PrismaClientOuTx } from '../../../shared/tipos';
import type { PeriodoAnalise, ServicoAnalitico } from '../servico-analitico';
import { calcularVidaUtil } from './vida-util.calculos';
import { VidaUtilRepository } from './vida-util.repository';

type Resultado = ReturnType<typeof calcularVidaUtil<TipoEquipamento>>;

export class VidaUtilService implements ServicoAnalitico<PeriodoAnalise, Resultado> {
  readonly tipo = 'VIDA_UTIL';
  readonly versaoModelo = '1.0.0';

  constructor(private repo: VidaUtilRepository, private minAmostra: number) {}

  async calcular(parametros: PeriodoAnalise, db: PrismaClientOuTx): Promise<Resultado> {
    const itens = await this.repo.consultar(parametros.organizacaoId, db);
    return calcularVidaUtil(itens, Object.values(TipoEquipamento), this.minAmostra, new Date());
  }

  persistir(execucaoId: string, resultado: Resultado, db: PrismaClientOuTx) {
    return this.repo.salvar(execucaoId, resultado, db);
  }

  resumo(resultado: Resultado) {
    return resultado.resumo;
  }
}
