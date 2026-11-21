import type { Config } from '../../config/env';
import { TipoAnalise } from '../../generated/prisma/client';
import type { PrismaClient } from '../../generated/prisma/client';
import type { AnalisesService } from '../analises/analises.service';
import { AvaliacaoPrevisoesService } from '../analises/vida-util/avaliacao.service';
import type { TarefaRelatorioService } from '../tarefas/tarefa-relatorio.service';
import { BullMQFila } from './bullmq.fila';
import type { FilaTrabalhos, ProcessarTrabalho } from './fila';
import { mensagemSegura, recuperavel } from './erros';

export function criarProcessadores(db: PrismaClient, config: Config, analises: AnalisesService, tarefas: TarefaRelatorioService, fila: FilaTrabalhos): ProcessarTrabalho {
  const avaliacao = new AvaliacaoPrevisoesService(db);
  return async (trabalho, tentativa) => {
    switch (trabalho.nome) {
      case 'relatorio.gerar':
        await tarefas.processar(trabalho.dados.tarefaId, tentativa);
        return;
      case 'analise.executar': {
        const { execucaoId } = trabalho.dados;
        try {
          await analises.executar(execucaoId, tentativa);
        } catch (erro) {
          await db.execucaoAnalise.updateMany({
            where: { id: execucaoId, status: { not: 'CONCLUIDA' } },
            data: { status: recuperavel(erro) && tentativa < config.jobMaxTentativas ? 'PENDENTE' : 'FALHOU', erro: mensagemSegura(erro), versao: { increment: 1 } },
          });
          throw erro;
        }
        return;
      }
      case 'analise.agendar':
        for (const tipo of Object.values(TipoAnalise)) {
          const e = await analises.criarExecucao(tipo, {}, 'AGENDADA', 'sistema');
          const { jobId } = await fila.enfileirar('analise.executar', { execucaoId: e.id }, { jobId: e.id });
          await db.execucaoAnalise.updateMany({ where: { id: e.id }, data: { jobId } });
        }
        await fila.enfileirar('analise.avaliar-previsoes', {});
        return;
      case 'analise.avaliar-previsoes':
        await avaliacao.avaliar();
        return;
      case 'manutencao.limpeza': {
        const agora = new Date();
        const limiteDetalhes = new Date(agora.getTime() - config.analiseRetencaoDias * 86400000);
        const limiteCabecalhos = new Date(agora.getTime() - 730 * 86400000);
        const detalhes = { execucao: { concluidaEm: { lt: limiteDetalhes } } };
        await db.$transaction([
          db.tarefaRelatorio.updateMany({ where: { expiraEm: { lte: agora }, conteudo: { not: null } }, data: { conteudo: null, versao: { increment: 1 } } }),
          db.chaveIdempotencia.deleteMany({ where: { expiraEm: { lte: agora } } }),
          db.metricaEficiencia.deleteMany({ where: detalhes }),
          db.metricaRentabilidade.deleteMany({ where: detalhes }),
          db.modeloVidaUtil.deleteMany({ where: detalhes }),
          db.execucaoAnalise.deleteMany({ where: { concluidaEm: { lt: limiteCabecalhos } } }),
        ]);
        return;
      }
      case 'manutencao.reconciliar': {
        if (!(fila instanceof BullMQFila)) return;
        const where = { status: 'PENDENTE' as const, criadoEm: { lt: new Date(Date.now() - 300000) } };
        const [execucoes, relatorios] = await Promise.all([
          db.execucaoAnalise.findMany({ where: { ...where, tarefas: { none: {} } }, select: { id: true, jobId: true } }),
          db.tarefaRelatorio.findMany({ where, select: { id: true, jobId: true } }),
        ]);
        for (const e of execucoes) {
          if (await trabalhoAtivo(fila, e.jobId ?? e.id)) continue;
          const { jobId } = await fila.enfileirar('analise.executar', { execucaoId: e.id }, { jobId: e.id });
          await db.execucaoAnalise.updateMany({ where: { id: e.id }, data: { jobId } });
        }
        for (const t of relatorios) {
          if (await trabalhoAtivo(fila, t.jobId ?? t.id)) continue;
          const { jobId } = await fila.enfileirar('relatorio.gerar', { tarefaId: t.id }, { jobId: t.id });
          await db.tarefaRelatorio.updateMany({ where: { id: t.id }, data: { jobId } });
        }
      }
    }
  };
}

async function trabalhoAtivo(fila: BullMQFila, id: string) {
  const existente = await fila.queue.getJob(id);
  if (!existente) return false;
  const estado = await existente.getState();
  if (estado === 'failed' || estado === 'completed') {
    await existente.remove();
    return false;
  }
  return true;
}
