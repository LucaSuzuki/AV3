import { publicoRotas } from './modules/publico/v1/publico.controller';
import { registrarChaveApi } from './modules/auth/chaves-api/chave-api.hook';
import { registrarSwaggerPublico } from './plugins/swagger';
import { registrarVersionamento } from './plugins/versionamento';
import { versoes } from './config/versoes';
import { parceiroRotas } from './modules/parceiros/parceiro.controller';
import { chaveApiRotas } from './modules/auth/chaves-api/chave-api.controller';
import { tarefaRotas } from './modules/tarefas/tarefa-relatorio.controller';
import { analisesRotas } from './modules/analises/analises.controller';
import type { FastifyInstance } from 'fastify';
import type { criarContainer } from './container';
import { authRotas } from './modules/auth/auth.controller';
import { usuarioRotas } from './modules/usuarios/usuario.controller';
import { organizacaoRotas } from './modules/organizacoes/organizacao.controller';
import { loteRotas } from './modules/lotes/lote.controller';
import { equipamentoRotas } from './modules/equipamentos/equipamento.controller';
import { relatorioRotas } from './modules/relatorios/relatorio.controller';
import { auditoriaRotas } from './modules/auditoria/auditoria.controller';

export function registrarRotas(app: FastifyInstance, services: ReturnType<typeof criarContainer>) {
  app.register(async internal => {
    authRotas(internal, services.auth);
    usuarioRotas(internal, services.usuarios);
    organizacaoRotas(internal, services.organizacoes);
    equipamentoRotas(internal, services.equipamentos);
    loteRotas(internal, services.lotes);
    relatorioRotas(internal, services.relatorios);
    auditoriaRotas(internal, services.auditoria);
    analisesRotas(internal, services.analises, services.auditoria);
    tarefaRotas(internal, services.tarefas);
  }, { prefix: '/api/v1/internal' });
  app.register(async admin => {
    admin.addHook('preHandler', admin.authorize(['ADMINISTRADOR']));
    parceiroRotas(admin, services.parceiros);
    chaveApiRotas(admin, services.chaves);
  }, { prefix: '/api/v1/admin' });
  app.register(async escopo => {
    await registrarSwaggerPublico(escopo);
    escopo.register(async publico => {
      registrarVersionamento(publico, versoes.v1);
      registrarChaveApi(publico, services.chaves);
      publicoRotas(publico, services.publico, services.tarefas);
    }, { prefix: '/api/v1/public' });
  });
}
