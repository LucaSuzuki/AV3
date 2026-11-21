import type { FastifyInstance } from 'fastify';
import { NivelRentabilidade, StatusExecucao, TipoEquipamento } from '../../generated/prisma/client';
import type { TipoAnalise } from '../../generated/prisma/client';
import { ConflitoError, NaoEncontradoError, RegraNegocioError, conferirVersao } from '../../shared/errors';
import { pagina, paginar } from '../../shared/pagination';
import type { Paginacao } from '../../shared/pagination';
import { dataHora, idParams, objeto, paginacao, schema, uuid, versao } from '../../shared/schemas';
import { AnalisesService } from './analises.service';
import type { EntradaAnalise } from './analises.service';
import { AvaliacaoPrevisoesService } from './vida-util/avaliacao.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

const tags = ['Análises'];
const periodo = { inicio: dataHora, fim: dataHora, organizacaoId: uuid };
const tipos: [string, TipoAnalise][] = [['eficiencia', 'EFICIENCIA'], ['rentabilidade', 'RENTABILIDADE'], ['vida-util', 'VIDA_UTIL']];
interface Consulta extends Paginacao { organizacaoId?: string; nivel?: NivelRentabilidade; status?: StatusExecucao; }

export function analisesRotas(app: FastifyInstance, service: AnalisesService, auditoria: AuditoriaService) {
  const db = app.prisma;
  const avaliacao = new AvaliacaoPrevisoesService(db);
  const leitura = app.authorize(['ADMINISTRADOR', 'GESTOR_ALMOXARIFADO', 'AUDITORIA']);
  const escrita = app.authorize(['ADMINISTRADOR', 'GESTOR_ALMOXARIFADO']);
  const admin = app.authorize(['ADMINISTRADOR']);
  const consultaResultado = objeto({ ...paginacao, organizacaoId: uuid, nivel: { type: 'string', enum: Object.values(NivelRentabilidade) } });

  async function resultado(id: string | undefined, tipo: TipoAnalise, q: Consulta) {
    const { skip, take } = paginar(q);
    const e = await db.execucaoAnalise.findFirst({
      where: id ? { id, tipo } : { tipo, status: 'CONCLUIDA', organizacaoId: q.organizacaoId ?? null },
      orderBy: [{ concluidaEm: 'desc' }, { id: 'desc' }],
      include: {
        metricasEficiencia: tipo === 'EFICIENCIA',
        metricasRentabilidade: tipo === 'RENTABILIDADE' ? { where: { nivel: q.nivel ?? 'TIPO' }, orderBy: [{ ranking: 'asc' }, { id: 'asc' }] } : false,
        modelosVidaUtil: tipo === 'VIDA_UTIL',
        previsoes: tipo === 'VIDA_UTIL' ? { skip, take, orderBy: { id: 'asc' } } : false,
        _count: { select: { previsoes: true } },
      },
    });
    if (!e) throw new NaoEncontradoError('Execução não encontrada.');
    const { resumo, metricasEficiencia, metricasRentabilidade, modelosVidaUtil, previsoes, _count, ...execucao } = e;
    if (tipo === 'VIDA_UTIL') return { execucao, resumo, modelos: modelosVidaUtil, previsoes: pagina(previsoes, _count.previsoes, q) };
    return { execucao, resumo, metricas: tipo === 'EFICIENCIA' ? metricasEficiencia : metricasRentabilidade };
  }

  for (const [nome, tipo] of tipos) {
    const prefixo = '/analises/' + nome;
    app.get<{ Querystring: Consulta }>(prefixo, {
      preHandler: leitura, schema: schema(tags, {}, { querystring: consultaResultado }),
    }, r => resultado(undefined, tipo, r.query));
    app.get<{ Querystring: Consulta }>(prefixo + '/execucoes', {
      preHandler: leitura, schema: schema(tags, {}, {
        querystring: objeto({ ...paginacao, organizacaoId: uuid, status: { type: 'string', enum: Object.values(StatusExecucao) } }),
      }),
    }, async ({ query }) => {
      const { skip, take } = paginar(query);
      const where = { tipo, status: query.status, organizacaoId: query.organizacaoId };
      const [items, total] = await Promise.all([
        db.execucaoAnalise.findMany({ where, skip, take, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }] }),
        db.execucaoAnalise.count({ where }),
      ]);
      return pagina(items, total, query);
    });
    app.get<{ Params: { id: string }; Querystring: Consulta }>(prefixo + '/execucoes/:id', {
      preHandler: leitura, schema: schema(tags, {}, { params: idParams, querystring: consultaResultado }),
    }, r => resultado(r.params.id, tipo, r.query));
    app.post<{ Body: EntradaAnalise }>(prefixo + '/executar', {
      preHandler: escrita, schema: schema(tags, {}, { body: objeto(periodo) }, 202),
    }, async (r, reply) => {
      const execucao = await service.criarExecucao(tipo, r.body, 'MANUAL', r.user.usuario);
      const { jobId } = await app.fila.enfileirar('analise.executar', { execucaoId: execucao.id }, { jobId: execucao.id });
      await db.execucaoAnalise.updateMany({ where: { id: execucao.id }, data: { jobId } });
      return reply.code(202).send({ execucaoId: execucao.id, status: execucao.status, jobId });
    });
  }

  const tipoEquipamento = { type: 'string', enum: Object.values(TipoEquipamento) };
  app.get<{ Querystring: { tipo?: TipoEquipamento; inicio?: string; fim?: string } }>('/analises/vida-util/acuracia', {
    preHandler: leitura, schema: schema(tags, {}, { querystring: objeto({ tipo: tipoEquipamento, inicio: dataHora, fim: dataHora }) }),
  }, r => avaliacao.acuracia(r.query));
  app.get('/analises/parametros-recuperacao', { preHandler: admin, schema: schema(tags, {}) }, () =>
    db.parametroRecuperacao.findMany({ orderBy: { tipo: 'asc' } }));
  app.put<{ Params: { tipo: TipoEquipamento }; Body: { valorBaseKg: number; fatoresEstado: number[]; versao: number } }>('/analises/parametros-recuperacao/:tipo', {
    preHandler: admin,
    schema: schema(tags, {}, {
      params: objeto({ tipo: tipoEquipamento }, ['tipo']),
      body: objeto({
        valorBaseKg: { type: 'number', minimum: 0, maximum: 99999999.9999, multipleOf: 0.0001 },
        fatoresEstado: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'number', minimum: 0, maximum: 1 } },
        versao,
      }, ['valorBaseKg', 'fatoresEstado', 'versao']),
    }),
  }, async r => {
    const { fatoresEstado, valorBaseKg } = r.body;
    if (fatoresEstado.some((valor, indice) => indice > 0 && valor > fatoresEstado[indice - 1])) {
      throw new RegraNegocioError('Os fatores devem ser não crescentes.');
    }
    return db.$transaction(async tx => {
      const antes = await tx.parametroRecuperacao.findUnique({ where: { tipo: r.params.tipo } });
      if (!antes) throw new NaoEncontradoError();
      conferirVersao(antes.versao, r.body.versao);
      const linhas = await tx.parametroRecuperacao.updateManyAndReturn({
        where: { id: antes.id, versao: antes.versao },
        data: { fatoresEstado, valorBaseKg, versao: { increment: 1 } },
      });
      const [depois] = linhas;
      if (!depois) throw new ConflitoError('Versão defasada. Recarregue o registro.');
      await auditoria.registrar('UPDATE', 'ParametroRecuperacao', antes.id, antes, depois, r.user.usuario, tx);
      return depois;
    });
  });
}
