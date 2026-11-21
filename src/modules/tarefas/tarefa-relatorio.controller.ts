import type { FastifyInstance } from 'fastify';
import { FormatoRelatorio, TipoAnalise } from '../../generated/prisma/client';
import type { EntradaAnalise } from '../analises/analises.service';
import { dataHora, erroSchema, objeto, schema, uuid } from '../../shared/schemas';
import { TarefaRelatorioService } from './tarefa-relatorio.service';

export const camposRelatorio = {
  tipo: { type: 'string', enum: Object.values(TipoAnalise), description: 'Tipo de análise do relatório.' },
  formato: { type: 'string', enum: Object.values(FormatoRelatorio), description: 'Formato do arquivo gerado.' },
  inicio: { ...dataHora, description: 'Início inclusivo do período.' },
  fim: { ...dataHora, description: 'Fim inclusivo do período.' },
};
export type EntradaRelatorio = EntradaAnalise & { tipo: TipoAnalise; formato: FormatoRelatorio };
export const tarefaParams = objeto({ tarefaId: { ...uuid, description: 'Identificador da tarefa assíncrona.' } }, ['tarefaId']);

export function tarefaRotas(app: FastifyInstance, tarefas: TarefaRelatorioService) {
  const leitura = app.authorize(['ADMINISTRADOR', 'GESTOR_ALMOXARIFADO', 'AUDITORIA']);
  const escrita = app.authorize(['ADMINISTRADOR', 'GESTOR_ALMOXARIFADO']);
  app.post<{ Body: EntradaRelatorio }>('/analises/relatorios', {
    preHandler: escrita,
    schema: schema(['Relatórios assíncronos'], {}, {
      body: objeto({ ...camposRelatorio, organizacaoId: uuid }, ['tipo', 'formato']),
    }, 202),
  }, async (r, reply) => reply.code(202).send(await tarefas.solicitar(r.body, r.user.usuario)));
  app.get<{ Params: { tarefaId: string } }>('/analises/relatorios/:tarefaId', {
    preHandler: leitura,
    schema: schema(['Relatórios assíncronos'], {}, { params: tarefaParams }),
  }, r => tarefas.status(r.params.tarefaId, null));
  app.get<{ Params: { tarefaId: string } }>('/analises/relatorios/:tarefaId/download', {
    preHandler: leitura,
    schema: { params: tarefaParams, tags: ['Relatórios assíncronos'], response: { 410: erroSchema } },
  }, async (r, reply) => {
    const arquivo = await tarefas.baixar(r.params.tarefaId, null);
    return reply.type(arquivo.tipoConteudo!).header('Content-Disposition', 'attachment; filename="' + arquivo.nomeArquivo + '"').send(Buffer.from(arquivo.conteudo!));
  });
}
