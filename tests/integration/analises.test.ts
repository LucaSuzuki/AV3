import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { lerEnv } from '../../src/config/env';
import { FilaInline } from '../../src/modules/fila/inline.fila';
import { AvaliacaoPrevisoesService } from '../../src/modules/analises/vida-util/avaliacao.service';
import { bancoTeste } from '../setup/database';
import { chamar, db, equipamentoInput, limpar, preparar, token } from '../setup/fixtures';

const base = '/api/v1/internal';
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ config: lerEnv({ ...process.env, DATABASE_URL: bancoTeste(), QUEUE_MODE: 'inline', ANALISE_MIN_AMOSTRA: '3' }), logger: false });
  await app.ready();
});
beforeEach(preparar);
afterAll(async () => { await app.close(); await limpar(); await db.$disconnect(); });

test('execuções persistem métricas e histórico, respeitando organização e RBAC', async () => {
  const admin = await token(app);
  const auditor = await token(app, 'AUDITORIA');
  const operador = await token(app, 'OPERADOR_CADASTRO');
  const org = await db.organizacao.findFirstOrThrow({ where: { ativo: true } });
  const rota = base + '/analises/eficiencia';
  expect((await chamar(app, auditor, 'GET', rota)).statusCode).toBe(404);
  expect((await chamar(app, auditor, 'POST', rota + '/executar', {})).statusCode).toBe(403);
  for (const body of [{}, { organizacaoId: org.id }]) {
    const r = await chamar(app, admin, 'POST', rota + '/executar', body);
    expect(r.statusCode).toBe(202);
    expect(r.json()).toMatchObject({ status: 'PENDENTE', execucaoId: expect.any(String), jobId: expect.any(String) });
    await (app.fila as FilaInline).aguardarOciosa();
    const consulta = await chamar(app, auditor, 'GET', rota + '/execucoes/' + r.json().execucaoId);
    expect(consulta.statusCode).toBe(200);
    expect(consulta.json()).toMatchObject({
      execucao: { status: 'CONCLUIDA', organizacaoId: 'organizacaoId' in body ? org.id : null },
      metricas: expect.arrayContaining([expect.objectContaining({ dimensao: 'GERAL' })]),
    });
  }
  expect((await chamar(app, operador, 'GET', rota)).statusCode).toBe(403);
  expect((await chamar(app, auditor, 'GET', rota + '/execucoes')).json().total).toBe(2);
  expect((await chamar(app, auditor, 'GET', rota + '?organizacaoId=' + org.id)).json().execucao.organizacaoId).toBe(org.id);
});

test('transições mantêm o ator, valor realizado é versionado e parâmetros exigem sete fatores ordenados', async () => {
  const admin = await token(app);
  const org = await db.organizacao.findFirstOrThrow({ where: { ativo: true } });
  const recebido = await chamar(app, admin, 'POST', base + '/lotes', {
    organizacaoId: org.id, notaFiscal: 'NF-AV3', transportadora: 'Teste', equipamentos: [equipamentoInput('AV3-TESTE')],
  });
  const lote = recebido.json();
  const andamento = await chamar(app, admin, 'POST', base + '/lotes/' + lote.id + '/triagem/iniciar', { versao: lote.versao });
  expect(andamento.statusCode).toBe(200);
  expect((await chamar(app, admin, 'POST', base + '/lotes/' + lote.id + '/triagem/concluir', { versao: andamento.json().versao })).statusCode).toBe(200);
  const trilha = await db.transicaoLote.findMany({ where: { loteId: lote.id }, orderBy: { dataHora: 'asc' } });
  expect(trilha.map(t => [t.statusNovo, t.usuario])).toEqual([
    ['RECEBIDO', 'admin'], ['EM_TRIAGEM', 'admin'], ['TRIAGEM_CONCLUIDA', 'admin'],
  ]);
  const eq = await db.equipamento.findFirstOrThrow({ where: { statusRastreamento: 'MATERIAL_RECICLAVEL' } });
  const rota = base + '/equipamentos/' + eq.id + '/valor-recuperado';
  expect((await chamar(app, admin, 'PATCH', rota, { valor: -1, versao: eq.versao })).statusCode).toBe(400);
  const gravado = await chamar(app, admin, 'PATCH', rota, { valor: 17.46, versao: eq.versao });
  expect(gravado.json()).toMatchObject({ valorRecuperadoReal: 17.46, versao: eq.versao + 1 });
  expect((await chamar(app, admin, 'PATCH', rota, { valor: 17.47, versao: eq.versao })).statusCode).toBe(409);
  const parametros = base + '/analises/parametros-recuperacao/NOTEBOOK';
  expect((await chamar(app, admin, 'PUT', parametros, { valorBaseKg: 10, versao: 1, fatoresEstado: [1, 0.9, 0.8, 0.9, 0.4, 0.3, 0] })).statusCode).toBe(422);
  expect((await chamar(app, admin, 'PUT', parametros, { valorBaseKg: 10, versao: 1, fatoresEstado: [1, 0.9, 0.8, 0.7, 0.4, 0.3, 0] })).statusCode).toBe(200);
});

test('acurácia cruza previsão com mudança posterior para estado inservível', async () => {
  const equipamento = await db.equipamento.findFirstOrThrow({ where: { estadoFisico: 6 } });
  const realizada = await db.movimentacao.findFirstOrThrow({ where: { equipamentoId: equipamento.id, destino: '6' } });
  const e = await db.execucaoAnalise.create({ data: { tipo: 'VIDA_UTIL', origem: 'MANUAL', solicitadoPor: 'teste', versaoModelo: '1.0.0' } });
  const modelo = await db.modeloVidaUtil.create({ data: {
    execucaoId: e.id, chave: 'GERAL', origemModelo: 'PROPRIO', amostra: 8, intercepto: 0, inclinacao: 1, r2: 1, erroPadraoResidual: 0, taxaDanificados: 0, confianca: 'BAIXA',
  } });
  const previsao = await db.previsaoVidaUtil.create({ data: {
    execucaoId: e.id, modeloId: modelo.id, equipamentoId: equipamento.id, idadeAtualAnos: 5, estadoFisicoAtual: 5, vidaRemanescenteAnos: 1,
    geradoEm: new Date(realizada.dataHora.getTime() - 86400000), dataPrevistaInservivel: new Date(realizada.dataHora.getTime() + 86400000),
  } });
  const avaliacao = new AvaliacaoPrevisoesService(db);
  expect(await avaliacao.avaliar()).toBe(1);
  expect(await avaliacao.avaliar()).toBe(0);
  expect(await db.previsaoVidaUtil.findUniqueOrThrow({ where: { id: previsao.id } })).toMatchObject({ realizadoEm: realizada.dataHora, erroDias: -1 });
  expect(await avaliacao.acuracia({})).toMatchObject({ amostra: 1, maeDias: 1, viesDias: -1, pendentes: 0 });
});
