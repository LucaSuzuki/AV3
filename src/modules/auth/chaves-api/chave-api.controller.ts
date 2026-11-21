import type { FastifyInstance } from 'fastify';
import { EscopoApi } from '../../../generated/prisma/client';
import { dataHora, idParams, objeto, schema, texto, versao } from '../../../shared/schemas';
import type { ChaveApiService, EntradaChave } from './chave-api.service';

const tags = ['Chaves de API'];

export function chaveApiRotas(app: FastifyInstance, service: ChaveApiService) {
  app.post<{ Params: { id: string }; Body: EntradaChave }>('/parceiros/:id/chaves', {
    schema: schema(tags, {}, { params: idParams, body: objeto({
      descricao: texto, escopos: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: Object.values(EscopoApi) } },
      limiteReqMin: { type: 'integer', minimum: 1, maximum: 10000 }, expiraEm: dataHora,
    }, ['descricao', 'escopos']) }, 201),
  }, async (r, reply) => reply.header('Cache-Control', 'no-store').code(201).send(await service.criar(r.params.id, r.body, r.user.usuario)));
  app.get<{ Params: { id: string } }>('/parceiros/:id/chaves', { schema: schema(tags, {}, { params: idParams }) }, r => service.listar(r.params.id));
  const opcoes = { params: idParams, body: objeto({ versao }, ['versao']) };
  app.post<{ Params: { id: string }; Body: { versao: number } }>('/chaves/:id/revogar', {
    schema: schema(tags, {}, opcoes),
  }, r => service.revogar(r.params.id, r.body.versao, r.user.usuario));
  app.post<{ Params: { id: string }; Body: { versao: number } }>('/chaves/:id/rotacionar', {
    schema: schema(tags, {}, opcoes),
  }, async (r, reply) => reply.header('Cache-Control', 'no-store').send(await service.rotacionar(r.params.id, r.body.versao, r.user.usuario)));
}
