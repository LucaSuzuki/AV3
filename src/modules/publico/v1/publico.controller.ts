import type { FastifyInstance } from 'fastify';
import { exigirEscopo } from '../../auth/chaves-api/chave-api.hook';
import type { FiltroEquipamento } from '../../equipamentos/equipamento.repository';
import type { FiltroLote } from '../../lotes/lote.repository';
import type { EntradaRelatorio } from '../../tarefas/tarefa-relatorio.controller';
import { camposRelatorio, tarefaParams } from '../../tarefas/tarefa-relatorio.controller';
import type { TarefaRelatorioService } from '../../tarefas/tarefa-relatorio.service';
import { dataHora, objeto, texto, uuid } from '../../../shared/schemas';
import type { EntradaLotePublica, PublicoService } from './publico.service';
import { entradaLotePublica, equipamentoPublicoSchema, filtrosEquipamento, filtrosLote, lotePublicoSchema, paginaEquipamentos, paginaLotes, schemaPublico, textoDescrito } from './publico.schemas';

const base = '/api/v1/public';

export function publicoRotas(app: FastifyInstance, service: PublicoService, tarefas: TarefaRelatorioService) {
  app.get('/me', { schema: schemaPublico('Identificar parceiro', 'Consulta os escopos e o limite aplicados à chave enviada.', objeto({
    parceiro: texto, organizacaoId: uuid, escopos: { type: 'array', items: texto }, limiteReqMin: { type: 'integer' },
  }), { operationId: 'identificarParceiro' }) }, r => {
    const chave = r.chaveApi!;
    return { parceiro: chave.parceiroNome, organizacaoId: chave.organizacaoId, escopos: chave.escopos, limiteReqMin: chave.limiteReqMin };
  });
  app.get<{ Querystring: FiltroEquipamento }>('/equipamentos', {
    preHandler: exigirEscopo('RASTREABILIDADE_LER'),
    schema: schemaPublico('Listar equipamentos', 'Lista os equipamentos da organização do parceiro.', paginaEquipamentos, { querystring: filtrosEquipamento }),
  }, r => service.listarEquipamentos(r.chaveApi!, r.query));
  app.get<{ Params: { codigoBarras: string } }>('/equipamentos/:codigoBarras/rastreio', {
    preHandler: exigirEscopo('RASTREABILIDADE_LER'),
    schema: schemaPublico('Rastrear equipamento', 'Consulta o histórico cronológico de um equipamento pelo código de barras.', objeto({
      equipamento: equipamentoPublicoSchema,
      movimentacoes: { type: 'array', items: objeto({ dataHora, origem: texto, destino: texto, observacao: { type: 'string' } }) },
    }), { params: objeto({ codigoBarras: textoDescrito('Código de barras interno do equipamento.') }, ['codigoBarras']) }),
  }, r => service.rastrear(r.chaveApi!, r.params.codigoBarras));
  app.get<{ Querystring: FiltroLote }>('/lotes', {
    preHandler: exigirEscopo('LOTES_LER'),
    schema: schemaPublico('Listar lotes', 'Lista os lotes da organização do parceiro.', paginaLotes, { querystring: filtrosLote }),
  }, r => service.listarLotes(r.chaveApi!, r.query));
  app.get<{ Params: { id: string } }>('/lotes/:id', {
    preHandler: exigirEscopo('LOTES_LER'),
    schema: schemaPublico('Consultar lote', 'Retorna os equipamentos e o peso total de um lote da organização.', lotePublicoSchema, {
      params: objeto({ id: { ...uuid, description: 'Identificador do lote.' } }, ['id']),
    }),
  }, r => service.obterLote(r.chaveApi!, r.params.id));
  app.post<{ Body: EntradaLotePublica; Headers: { 'idempotency-key'?: string } }>('/lotes', {
    preHandler: exigirEscopo('LOTES_ESCREVER'),
    schema: schemaPublico('Submeter lote', 'Cadastra o lote e seus equipamentos em uma única transação.', lotePublicoSchema, {
      body: entradaLotePublica, headers: {
        type: 'object', properties: {
          'idempotency-key': { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', description: 'Chave de repetição segura do pedido.', examples: ['lote-2026-001'] },
        },
      },
    }, 201),
  }, async (r, reply) => {
    const resultado = await service.criarLote(r.chaveApi!, r.body, r.headers['idempotency-key']);
    if (resultado.replay) reply.header('Idempotent-Replay', 'true');
    return reply.header('Location', base + '/lotes/' + resultado.corpo.id).code(201).send(resultado.corpo);
  });
  app.post<{ Body: EntradaRelatorio }>('/relatorios', {
    preHandler: exigirEscopo('RELATORIOS_GERAR'),
    schema: schemaPublico('Solicitar relatório', 'Enfileira a geração de um relatório da organização e retorna a URL para consulta.', objeto({
      tarefaId: uuid, status: texto, statusUrl: texto, criadoEm: dataHora,
    }), { operationId: 'solicitarRelatorioPublico', body: {
      ...objeto(camposRelatorio, ['tipo', 'formato']), examples: [{ tipo: 'EFICIENCIA', formato: 'CSV' }],
    } }, 202),
  }, async (r, reply) => {
    const chave = r.chaveApi!;
    const tarefa = await tarefas.solicitar({ ...r.body, organizacaoId: chave.organizacaoId }, 'parceiro:' + chave.parceiroNome, chave.parceiroId);
    const statusUrl = base + '/relatorios/' + tarefa.tarefaId;
    const { criadoEm } = await tarefas.status(tarefa.tarefaId, chave.parceiroId);
    return reply.header('Location', statusUrl).code(202).send({ tarefaId: tarefa.tarefaId, status: tarefa.status, statusUrl, criadoEm });
  });
  app.get<{ Params: { tarefaId: string } }>('/relatorios/:tarefaId', {
    preHandler: exigirEscopo('RELATORIOS_GERAR'),
    schema: schemaPublico('Consultar tarefa', 'Acompanha o progresso e informa o endereço do arquivo após a conclusão.', objeto({
      tarefaId: uuid, tipo: texto, formato: texto, status: texto, progresso: { type: 'integer' }, tentativas: { type: 'integer' },
      erro: { type: 'string' }, criadoEm: dataHora, concluidaEm: dataHora, expiraEm: dataHora, downloadUrl: texto,
    }), { params: tarefaParams }),
  }, async r => {
    const t = await tarefas.status(r.params.tarefaId, r.chaveApi!.parceiroId);
    const { tipo, formato, status, progresso, tentativas, criadoEm, expiraEm } = t;
    return {
      tarefaId: t.id, tipo, formato, status, progresso, tentativas, criadoEm, expiraEm,
      erro: t.erro ?? undefined, concluidaEm: t.concluidaEm ?? undefined,
      downloadUrl: status === 'CONCLUIDA' && expiraEm > new Date() ? base + '/relatorios/' + t.id + '/download' : undefined,
    };
  });
  app.get<{ Params: { tarefaId: string } }>('/relatorios/:tarefaId/download', {
    preHandler: exigirEscopo('RELATORIOS_GERAR'),
    schema: schemaPublico('Baixar relatório', 'Baixa o arquivo CSV ou JSON concluído antes de sua expiração.', {
      content: { 'text/csv': { schema: { type: 'string', format: 'binary' } }, 'application/json': { schema: { type: 'object' } } },
    }, { params: tarefaParams }),
  }, async (r, reply) => {
    const arquivo = await tarefas.baixar(r.params.tarefaId, r.chaveApi!.parceiroId);
    return reply.type(arquivo.tipoConteudo!).header('Content-Disposition', 'attachment; filename="' + arquivo.nomeArquivo + '"').send(Buffer.from(arquivo.conteudo!));
  });
}
