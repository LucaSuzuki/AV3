import type { OrigemExecucao, Prisma, PrismaClient, TipoAnalise } from '../../generated/prisma/client';
import { NaoEncontradoError, RegraNegocioError } from '../../shared/errors';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AnalisesRepository } from './analises.repository';
import { EficienciaService } from './eficiencia/eficiencia.service';
import { RentabilidadeService } from './rentabilidade/rentabilidade.service';
import type { PeriodoAnalise, ServicoAnalitico } from './servico-analitico';
import { VidaUtilService } from './vida-util/vida-util.service';

export interface EntradaAnalise {
  inicio?: string;
  fim?: string;
  organizacaoId?: string;
}

export class AnalisesService {
  private readonly servicos;

  constructor(
    private prisma: PrismaClient,
    private repo: AnalisesRepository,
    private auditoria: AuditoriaService,
    private janelaDias: number,
    eficiencia: EficienciaService,
    rentabilidade: RentabilidadeService,
    vidaUtil: VidaUtilService,
  ) {
    this.servicos = { EFICIENCIA: eficiencia, RENTABILIDADE: rentabilidade, VIDA_UTIL: vidaUtil };
  }

  async criarExecucao(tipo: TipoAnalise, entrada: EntradaAnalise, origem: OrigemExecucao, solicitante: string, transacao?: Prisma.TransactionClient) {
    const fim = entrada.fim ? new Date(entrada.fim) : new Date();
    const inicio = entrada.inicio ? new Date(entrada.inicio) : new Date(fim.getTime() - this.janelaDias * 86_400_000);
    if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime())) throw new RegraNegocioError('Período inválido.');
    if (inicio > fim) throw new RegraNegocioError('Período invertido.');
    const criar = async (db: Prisma.TransactionClient) => {
      if (entrada.organizacaoId && !await db.organizacao.findUnique({ where: { id: entrada.organizacaoId }, select: { id: true } })) {
        throw new NaoEncontradoError('Organização não encontrada.');
      }
      const execucao = await this.repo.criar({
        tipo, origem, organizacaoId: entrada.organizacaoId,
        parametros: { inicio: inicio.toISOString(), fim: fim.toISOString() },
        solicitadoPor: solicitante, versaoModelo: this.servicos[tipo].versaoModelo,
      }, db);
      await this.auditoria.registrar('EXECUTE_ANALYSIS', 'ExecucaoAnalise', execucao.id, undefined, execucao, solicitante, db);
      return execucao;
    };
    return transacao ? criar(transacao) : this.repo.transacao(criar);
  }

  async executar(id: string, tentativa?: number) {
    const anterior = await this.repo.porId(id);
    if (!anterior) throw new NaoEncontradoError();
    if (anterior.status === 'CONCLUIDA') return anterior;
    const iniciadaEm = new Date();
    const execucao = await this.repo.atualizar(id, anterior.versao, {
      status: 'EM_PROCESSAMENTO', iniciadaEm, erro: null,
      tentativas: tentativa === undefined ? { increment: 1 } : Math.max(tentativa, anterior.tentativas),
    });
    const { inicio, fim } = execucao.parametros as { inicio: string; fim: string };
    const parametros = { inicio: new Date(inicio), fim: new Date(fim), organizacaoId: execucao.organizacaoId ?? undefined };
    switch (execucao.tipo) {
      case 'EFICIENCIA': return this.finalizar(this.servicos.EFICIENCIA, execucao, parametros, iniciadaEm);
      case 'RENTABILIDADE': return this.finalizar(this.servicos.RENTABILIDADE, execucao, parametros, iniciadaEm);
      case 'VIDA_UTIL': return this.finalizar(this.servicos.VIDA_UTIL, execucao, parametros, iniciadaEm);
    }
  }

  private async finalizar<R>(servico: ServicoAnalitico<PeriodoAnalise, R>, execucao: { id: string; versao: number }, parametros: PeriodoAnalise, iniciadaEm: Date) {
    const resultado = await servico.calcular(parametros, this.prisma);
    return this.repo.transacao(async db => {
      const concluidaEm = new Date();
      const concluida = await this.repo.atualizar(execucao.id, execucao.versao, {
        status: 'CONCLUIDA', concluidaEm, duracaoMs: concluidaEm.getTime() - iniciadaEm.getTime(),
        resumo: servico.resumo(resultado) as Prisma.InputJsonObject,
      }, db);
      await servico.persistir(execucao.id, resultado, db);
      return concluida;
    });
  }
}
