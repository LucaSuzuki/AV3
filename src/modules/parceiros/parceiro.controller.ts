import type { FastifyInstance } from 'fastify';
import { idParams, objeto, paginacao, schema, texto, uuid, versao } from '../../shared/schemas';
import type { FiltroParceiro } from './parceiro.repository';
import type { EntradaParceiro, MudancaParceiro, ParceiroService } from './parceiro.service';

const tags = ['Parceiros'];
const contatoEmail = { ...texto, format: 'email' };
const ativo = { type: 'boolean' };

export function parceiroRotas(app: FastifyInstance, service: ParceiroService) {
  app.post<{ Body: EntradaParceiro }>('/parceiros', { schema: schema(tags, {}, {
    body: objeto({ nome: texto, organizacaoId: uuid, contatoEmail }, ['nome', 'organizacaoId', 'contatoEmail']),
  }, 201) }, async (r, reply) => reply.code(201).send(await service.criar(r.body, r.user.usuario)));
  app.get<{ Querystring: FiltroParceiro }>('/parceiros', { schema: schema(tags, {}, {
    querystring: objeto({ ...paginacao, ativo, q: texto }),
  }) }, r => service.listar(r.query));
  app.get<{ Params: { id: string } }>('/parceiros/:id', { schema: schema(tags, {}, { params: idParams }) }, r => service.obter(r.params.id));
  app.patch<{ Params: { id: string }; Body: MudancaParceiro }>('/parceiros/:id', { schema: schema(tags, {}, {
    params: idParams, body: objeto({ contatoEmail, ativo, versao }, ['versao']),
  }) }, r => service.atualizar(r.params.id, r.body, r.user.usuario));
}
