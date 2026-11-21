import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { lerEnv } from '../../src/config/env';
import { bancoTeste } from '../setup/database';
import { chamar, db, equipamentoInput, limpar, preparar, token } from '../setup/fixtures';
import { FilaInline } from '../../src/modules/fila/inline.fila';
import { sha256 } from '../../src/shared/hash';

let app: FastifyInstance;
const adminBase = '/api/v1/admin';
const publico = '/api/v1/public';

beforeAll(async () => {
  app = await buildApp({ config: lerEnv({ ...process.env, DATABASE_URL: bancoTeste(), NODE_ENV: 'test', QUEUE_MODE: 'inline' }), logger: false });
  await app.ready();
});
beforeEach(preparar);
afterAll(async () => { await app.close(); await limpar(); await db.$disconnect(); });

async function criarChave(limiteReqMin = 60) {
  const parceiro = await db.parceiro.findUniqueOrThrow({ where: { nome: 'Parceiro Exemplo' } });
  const jwt = await token(app);
  const resposta = await chamar(app, jwt, 'POST', adminBase + '/parceiros/' + parceiro.id + '/chaves', {
    descricao: 'Integração', escopos: ['LOTES_LER', 'LOTES_ESCREVER', 'RASTREABILIDADE_LER', 'RELATORIOS_GERAR'], limiteReqMin,
  });
  expect(resposta.statusCode).toBe(201);
  expect(resposta.headers['cache-control']).toBe('no-store');
  return { ...resposta.json(), jwt, parceiro };
}

test('chave protegida, limites independentes e documentação segregada', async () => {
  const a = await criarChave(1);
  const b = await criarChave(1);
  const gravada = await db.chaveApi.findUniqueOrThrow({ where: { id: a.id } });
  expect(gravada.hashChave).toBe(sha256(a.chave.split('.')[1]));
  const lista = await chamar(app, a.jwt, 'GET', adminBase + '/parceiros/' + a.parceiro.id + '/chaves');
  expect(lista.body).not.toContain('hashChave');
  expect(lista.body).not.toContain(a.chave);
  const me = (chave: string) => app.inject({ method: 'GET', url: publico + '/me', headers: { 'x-api-key': chave }, remoteAddress: '192.0.2.55' });
  expect((await me(a.chave)).headers['x-api-version']).toBe('1.0.0');
  const limitado = await me(a.chave);
  expect(limitado.statusCode).toBe(429);
  expect(limitado.headers['retry-after']).toBeDefined();
  expect((await me(b.chave)).statusCode).toBe(200);
  expect((await app.inject({ url: publico + '/me', headers: { authorization: 'Bearer ' + a.jwt } })).statusCode).toBe(401);
  expect((await app.inject({ url: '/api/v1/internal/lotes', headers: { 'x-api-key': a.chave } })).statusCode).toBe(401);
  const internas = (await app.inject('/docs/json')).json().paths;
  const publicas = (await app.inject('/docs/public/json')).json().paths;
  expect(Object.keys(internas).some(p => p.startsWith(publico))).toBe(false);
  expect(Object.keys(publicas)).toHaveLength(8);
  expect(Object.keys(publicas).every(p => p.startsWith(publico))).toBe(true);
});

test('parceiro cadastra lote idempotente, rastreia e baixa relatório CSV', async () => {
  const { chave, parceiro } = await criarChave();
  const headers = { 'x-api-key': chave };
  const payload = { notaFiscal: 'NF-PUBLICA', transportadora: 'Logística Verde', equipamentos: [equipamentoInput('PUBLICA-01')] };
  const enviar = (body: typeof payload) => app.inject({
    method: 'POST', url: publico + '/lotes', headers: { ...headers, 'idempotency-key': 'jornada-av3' }, payload: body,
  });
  const primeiro = await enviar(payload);
  expect(primeiro.statusCode).toBe(201);
  const repetido = await enviar(payload);
  expect(repetido.statusCode).toBe(201);
  expect(repetido.headers['idempotent-replay']).toBe('true');
  expect(repetido.json()).toEqual(primeiro.json());
  expect((await enviar({ ...payload, notaFiscal: 'OUTRA' })).statusCode).toBe(409);
  const lote = primeiro.json();
  expect(await db.transicaoLote.findFirst({ where: { loteId: lote.id } })).toMatchObject({ statusNovo: 'RECEBIDO', usuario: 'parceiro:' + parceiro.nome });
  const outro = await db.lote.findFirstOrThrow({ where: { organizacaoId: { not: parceiro.organizacaoId } } });
  expect((await app.inject({ url: publico + '/lotes/' + outro.id, headers })).statusCode).toBe(404);
  const rastreio = await app.inject({ url: publico + '/equipamentos/PUBLICA-01/rastreio', headers });
  expect(rastreio.statusCode).toBe(200);
  expect(rastreio.body).not.toMatch(/responsavel|versao/);
  const relatorio = await app.inject({ method: 'POST', url: publico + '/relatorios', headers, payload: { tipo: 'EFICIENCIA', formato: 'CSV' } });
  expect(relatorio.statusCode).toBe(202);
  await (app.fila as FilaInline).aguardarOciosa();
  const url = relatorio.json().statusUrl;
  expect((await app.inject({ url, headers })).json()).toMatchObject({ status: 'CONCLUIDA', progresso: 100 });
  const download = await app.inject({ url: url + '/download', headers });
  expect(download.statusCode).toBe(200);
  expect(download.rawPayload.subarray(0, 3).toString('hex')).toBe('efbbbf');
  expect(download.body).toContain('\r\n');
  expect(download.body).not.toContain('OPERADOR');
});

test('rotaciona e revoga chave com controle de versão', async () => {
  const antiga = await criarChave();
  const nova = await chamar(app, antiga.jwt, 'POST', adminBase + '/chaves/' + antiga.id + '/rotacionar', { versao: antiga.versao });
  expect(nova.statusCode).toBe(200);
  const me = (chave: string) => app.inject({ url: publico + '/me', headers: { 'x-api-key': chave } });
  expect((await me(antiga.chave)).statusCode).toBe(200);
  expect((await me(nova.json().chave)).statusCode).toBe(200);
  expect((await chamar(app, antiga.jwt, 'POST', adminBase + '/chaves/' + antiga.id + '/revogar', { versao: antiga.versao })).statusCode).toBe(409);
  expect((await chamar(app, antiga.jwt, 'POST', adminBase + '/chaves/' + antiga.id + '/revogar', { versao: antiga.versao + 1 })).statusCode).toBe(200);
  const revogada = await me(antiga.chave);
  expect(revogada.statusCode).toBe(401);
  expect(revogada.json()).toEqual((await me('invalida')).json());
});

test('relatório JSON é isolado por parceiro e retorna 410 quando expira', async () => {
  const { chave, jwt, parceiro } = await criarChave();
  const org = await db.organizacao.findUniqueOrThrow({ where: { id: parceiro.organizacaoId } });
  const outro = await chamar(app, jwt, 'POST', adminBase + '/parceiros', { nome: 'Outro parceiro', organizacaoId: org.id, contatoEmail: 'outro@exemplo.com' });
  const novo = await chamar(app, jwt, 'POST', adminBase + '/parceiros/' + outro.json().id + '/chaves', { descricao: 'Outro', escopos: ['RELATORIOS_GERAR'] });
  const headers = { 'x-api-key': chave };
  const tarefa = await app.inject({ method: 'POST', url: publico + '/relatorios', headers, payload: { tipo: 'RENTABILIDADE', formato: 'JSON' } });
  expect(tarefa.statusCode).toBe(202);
  const { tarefaId, statusUrl } = tarefa.json();
  await (app.fila as FilaInline).aguardarOciosa();
  expect((await app.inject({ url: statusUrl, headers: { 'x-api-key': novo.json().chave } })).statusCode).toBe(404);
  const download = await app.inject({ url: statusUrl + '/download', headers });
  expect(download.statusCode).toBe(200);
  expect(download.json()).toMatchObject({ meta: { tipo: 'RENTABILIDADE', organizacaoId: org.id }, dados: expect.any(Array) });
  await db.tarefaRelatorio.update({ where: { id: tarefaId }, data: { expiraEm: new Date(0) } });
  expect((await app.inject({ url: statusUrl + '/download', headers })).statusCode).toBe(410);
});
