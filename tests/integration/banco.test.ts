import { Prisma } from '../../src/generated/prisma/client';
import { db, preparar, limpar } from '../setup/fixtures';

beforeEach(preparar);
afterAll(async () => { await limpar(); await db.$disconnect(); });

describe('Constraints e triggers via SQL cru', () => {
  test.each([
    ['valor recuperado negativo', Prisma.sql`UPDATE equipamentos SET "valorRecuperadoReal" = -1`],
    ['valor base negativo', Prisma.sql`UPDATE parametros_recuperacao SET "valorBaseKg" = -1`],
    ['fatores com tamanho incorreto', Prisma.sql`UPDATE parametros_recuperacao SET "fatoresEstado" = '[1]'::jsonb`],
    ['transição de lote UPDATE', Prisma.sql`UPDATE transicoes_lote SET usuario = 'alterado'`],
    ['transição de lote DELETE', Prisma.sql`DELETE FROM transicoes_lote`],
    ['estado físico', Prisma.sql`UPDATE equipamentos SET "estadoFisico" = 7`],
    ['peso', Prisma.sql`UPDATE equipamentos SET "pesoQuilogramas" = 0`],
    ['posição', Prisma.sql`UPDATE equipamentos SET "posicaoNoLote" = 0`],
    ['ano baixo', Prisma.sql`UPDATE equipamentos SET "anoFabricacao" = 1949`],
    ['ano alto', Prisma.sql`UPDATE equipamentos SET "anoFabricacao" = 2101`],
    ['valor mensal', Prisma.sql`UPDATE contratos SET "valorMensal" = -1`],
    ['vigência', Prisma.sql`UPDATE contratos SET "dataVencimento" = "dataAssinatura"`],
    ['CNPJ', Prisma.sql`UPDATE organizacoes SET cnpj = 'ABCD'`],
    ['movimentação UPDATE', Prisma.sql`UPDATE movimentacoes SET observacao = 'alterada'`],
    ['movimentação DELETE', Prisma.sql`DELETE FROM movimentacoes`],
    ['desmonte antecipado', Prisma.sql`UPDATE equipamentos SET "statusRastreamento" = 'EM_DESMONTE' WHERE "loteId" IN (SELECT id FROM lotes WHERE "statusProcessamento" = 'RECEBIDO')`],
    ['aguardando desmonte antecipado', Prisma.sql`UPDATE equipamentos SET "statusRastreamento" = 'AGUARDANDO_DESMONTE' WHERE "loteId" IN (SELECT id FROM lotes WHERE "statusProcessamento" = 'EM_TRIAGEM')`],
    ['saída de triagem com desmonte pendente', Prisma.sql`UPDATE lotes SET "statusProcessamento" = 'ENCAMINHADO' WHERE "statusProcessamento" = 'TRIAGEM_CONCLUIDA'`],
  ])('%s rejeitado no banco', async (_nome, sql) => { await expect(db.$executeRaw(sql as Prisma.Sql)).rejects.toThrow(); });
  test('rejeita limites e hashes de chaves e valores inválidos nas tabelas de resultados', async () => {
    const parceiro = await db.parceiro.findFirstOrThrow();
    await db.chaveApi.create({ data: {
      parceiroId: parceiro.id, prefixo: 'gck_0123456789', hashChave: 'a'.repeat(64),
      descricao: 'Teste', escopos: ['LOTES_LER'],
    } });
    const execucao = await db.execucaoAnalise.create({ data: { tipo: 'VIDA_UTIL', origem: 'MANUAL', solicitadoPor: 'teste', versaoModelo: '1' } });
    await db.tarefaRelatorio.create({ data: {
      tipo: 'VIDA_UTIL', formato: 'JSON', solicitadoPor: 'teste', execucaoId: execucao.id, expiraEm: new Date(),
    } });
    await db.metricaEficiencia.create({ data: {
      execucaoId: execucao.id, dimensao: 'GERAL', chave: 'todos', amostra: 1, tempoMedioHoras: 1, medianaHoras: 1,
      desvioPadraoHoras: 0, p90Horas: 1, esperaMediaHoras: 0.5, triagemMediaHoras: 0.5,
    } });
    await db.metricaRentabilidade.create({ data: {
      execucaoId: execucao.id, nivel: 'TIPO', chave: 'NOTEBOOK', tipo: 'NOTEBOOK', amostra: 1, amostraRealizada: 1,
      pesoTotalKg: 1, valorMedioUnidade: 2, valorMedioPorKg: 2, valorTotalEstimado: 2, fonte: 'REALIZADO',
    } });
    const modelo = await db.modeloVidaUtil.create({ data: {
      execucaoId: execucao.id, chave: 'GERAL', origemModelo: 'PROPRIO', amostra: 2, intercepto: 1,
      inclinacao: 1, r2: 1, erroPadraoResidual: 0, taxaDanificados: 0, confianca: 'BAIXA',
    } });
    const equipamento = await db.equipamento.findFirstOrThrow();
    await db.previsaoVidaUtil.create({ data: {
      execucaoId: execucao.id, modeloId: modelo.id, equipamentoId: equipamento.id, idadeAtualAnos: 2,
      estadoFisicoAtual: 2, vidaRemanescenteAnos: 3, dataPrevistaInservivel: new Date(),
    } });
    const casos = [
      [`ck_chave_limite`, Prisma.sql`UPDATE chaves_api SET "limiteReqMin" = 0`],
      [`ck_chave_escopos`, Prisma.sql`UPDATE chaves_api SET escopos = ARRAY[]::"EscopoApi"[]`],
      [`ck_chave_hash`, Prisma.sql`UPDATE chaves_api SET "hashChave" = 'XYZ'`],
      [`ck_tarefa_progresso`, Prisma.sql`UPDATE tarefas_relatorio SET progresso = 101`],
      [`ck_exec_tentativas`, Prisma.sql`UPDATE execucoes_analise SET tentativas = -1`],
      [`ck_prev_estado`, Prisma.sql`UPDATE previsoes_vida_util SET "estadoFisicoAtual" = 7`],
      [`ck_prev_vida`, Prisma.sql`UPDATE previsoes_vida_util SET "vidaRemanescenteAnos" = -1`],
      [`ck_met_ef_amostra`, Prisma.sql`UPDATE metricas_eficiencia SET amostra = -1`],
      [`ck_met_rent_amostra`, Prisma.sql`UPDATE metricas_rentabilidade SET "amostraRealizada" = 2`],
    ] as const;
    for (const [constraint, sql] of casos) await expect(db.$executeRaw(sql)).rejects.toThrow(constraint);
  });
  test('data futura rejeitada no INSERT; histórico de mais de 90 dias permitido', async () => {
    const org = await db.organizacao.findFirstOrThrow();
    await expect(db.$executeRaw`INSERT INTO lotes (id, "organizacaoId", "dataEntrada", "notaFiscal", transportadora) VALUES (gen_random_uuid(), ${org.id}::uuid, CURRENT_TIMESTAMP + INTERVAL '1 day', 'FUTURO', 'T')`).rejects.toThrow();
    await expect(db.$executeRaw`INSERT INTO lotes (id, "organizacaoId", "dataEntrada", "notaFiscal", transportadora) VALUES (gen_random_uuid(), ${org.id}::uuid, CURRENT_TIMESTAMP - INTERVAL '365 days', 'HISTORICO', 'T')`).resolves.toBe(1);
  });
  test('FK restritiva impede remoção de organização com lote', async () => {
    const lote = await db.lote.findFirstOrThrow();
    await expect(db.$executeRaw`DELETE FROM organizacoes WHERE id = ${lote.organizacaoId}::uuid`).rejects.toThrow();
  });
  test('unicidades de CNPJ, código de barras, posição e contrato são do banco', async () => {
    const orgs = await db.organizacao.findMany();
    await expect(db.$executeRaw`UPDATE organizacoes SET cnpj = ${orgs[0].cnpj} WHERE id = ${orgs[1].id}::uuid`).rejects.toThrow();
    const equips = await db.equipamento.findMany();
    await expect(db.$executeRaw`UPDATE equipamentos SET "codigoBarrasInterno" = ${equips[0].codigoBarrasInterno} WHERE id = ${equips[1].id}::uuid`).rejects.toThrow();
    const [a, b] = equips.filter(e => e.loteId === '00000000-0000-4000-8000-000000000003');
    await expect(db.$executeRaw`UPDATE equipamentos SET "posicaoNoLote" = ${a.posicaoNoLote} WHERE id = ${b.id}::uuid`).rejects.toThrow();
    const contratos = await db.contrato.findMany();
    await expect(db.$executeRaw`UPDATE contratos SET "organizacaoId" = ${contratos[0].organizacaoId}::uuid WHERE id = ${contratos[1].id}::uuid`).rejects.toThrow();
  });
});
