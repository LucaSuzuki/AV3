import type { Config } from '../../config/env';
import type { FormatoRelatorio, PrismaClient, StatusExecucao, TipoAnalise } from '../../generated/prisma/client';
import { AppError, ConflitoError, NaoEncontradoError } from '../../shared/errors';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AnalisesService } from '../analises/analises.service';
import type { EntradaAnalise } from '../analises/analises.service';
import type { FilaTrabalhos } from '../fila/fila';
import { mensagemSegura, recuperavel } from '../fila/erros';
import { GeradorRelatorio } from './gerador';

const metadados = {
  id: true, tipo: true, formato: true, status: true, progresso: true, tentativas: true,
  erro: true, nomeArquivo: true, tamanhoBytes: true, criadoEm: true, iniciadaEm: true,
  concluidaEm: true, expiraEm: true,
} as const;

export class TarefaRelatorioService {
  private gerador: GeradorRelatorio;

  constructor(private db: PrismaClient, private analises: AnalisesService, private fila: FilaTrabalhos, private config: Config, private auditoria: AuditoriaService) {
    this.gerador = new GeradorRelatorio(db, config.relatorioMaxBytes);
  }

  async solicitar(entrada: EntradaAnalise & { tipo: TipoAnalise; formato: FormatoRelatorio }, usuario: string, parceiroId?: string) {
    const tarefa = await this.db.$transaction(async tx => {
      if (parceiroId) {
        await tx.$queryRaw`SELECT id FROM parceiros WHERE id = ${parceiroId}::uuid FOR UPDATE`;
        const ativas = await tx.tarefaRelatorio.count({ where: { parceiroId, status: { in: ['PENDENTE', 'EM_PROCESSAMENTO'] } } });
        if (ativas >= 5) throw new AppError(429, 'LIMITE_TAREFAS', 'Limite de tarefas em andamento atingido.');
      }
      const execucao = await this.analises.criarExecucao(entrada.tipo, entrada, parceiroId ? 'API_PUBLICA' : 'MANUAL', usuario, tx);
      const criada = await tx.tarefaRelatorio.create({ data: {
        tipo: entrada.tipo, formato: entrada.formato, organizacaoId: entrada.organizacaoId, parceiroId,
        solicitadoPor: usuario, parametros: execucao.parametros ?? {}, execucaoId: execucao.id,
        expiraEm: new Date(Date.now() + this.config.relatorioTtlHoras * 3600000),
      } });
      await this.auditoria.registrar('CREATE', 'TarefaRelatorio', criada.id, undefined, criada, usuario, tx);
      return criada;
    });
    const { jobId } = await this.fila.enfileirar('relatorio.gerar', { tarefaId: tarefa.id }, { jobId: tarefa.id });
    await this.db.tarefaRelatorio.updateMany({ where: { id: tarefa.id }, data: { jobId } });
    return { tarefaId: tarefa.id, status: tarefa.status, jobId };
  }

  async status(id: string, parceiroId: string | null) {
    const tarefa = await this.db.tarefaRelatorio.findFirst({ where: { id, parceiroId }, select: metadados });
    if (!tarefa) throw new NaoEncontradoError();
    return tarefa;
  }

  async baixar(id: string, parceiroId: string | null) {
    const tarefa = await this.db.tarefaRelatorio.findFirst({
      where: { id, parceiroId }, select: { status: true, expiraEm: true, conteudo: true, nomeArquivo: true, tipoConteudo: true },
    });
    if (!tarefa) throw new NaoEncontradoError();
    if (tarefa.expiraEm <= new Date()) throw new AppError(410, 'RELATORIO_EXPIRADO', 'Relatório expirado.');
    if (tarefa.status !== 'CONCLUIDA' || !tarefa.conteudo) throw new ConflitoError('O relatório ainda não está disponível.');
    return tarefa;
  }

  async processar(id: string, tentativa: number) {
    const tarefa = await this.db.tarefaRelatorio.findUnique({ where: { id } });
    if (!tarefa || !tarefa.execucaoId) throw new NaoEncontradoError();
    if (tarefa.status === 'CONCLUIDA') return;
    const iniciadaEm = new Date();
    const ativa = await this.db.tarefaRelatorio.update({
      where: { id, versao: tarefa.versao },
      data: { status: 'EM_PROCESSAMENTO', progresso: 10, iniciadaEm, tentativas: { increment: 1 }, versao: { increment: 1 } },
    });
    try {
      const execucao = await this.analises.executar(tarefa.execucaoId, tentativa);
      const progresso = await this.db.tarefaRelatorio.update({
        where: { id, versao: ativa.versao }, data: { progresso: 60, versao: { increment: 1 } },
      });
      const arquivo = await this.gerador.gerar(tarefa, execucao);
      await this.db.tarefaRelatorio.update({
        where: { id, versao: progresso.versao },
        data: { ...arquivo, progresso: 100, status: 'CONCLUIDA', concluidaEm: new Date(), erro: null, versao: { increment: 1 } },
      });
    } catch (erro) {
      const status: StatusExecucao = recuperavel(erro) && tentativa < this.config.jobMaxTentativas ? 'PENDENTE' : 'FALHOU';
      const falha = { status, erro: mensagemSegura(erro), versao: { increment: 1 }, ...(status === 'FALHOU' ? { concluidaEm: new Date() } : {}) };
      await this.db.$transaction([
        this.db.tarefaRelatorio.updateMany({ where: { id, status: 'EM_PROCESSAMENTO', iniciadaEm }, data: falha }),
        this.db.execucaoAnalise.updateMany({ where: { id: tarefa.execucaoId, status: 'EM_PROCESSAMENTO' }, data: falha }),
      ]);
      throw erro;
    }
  }
}
