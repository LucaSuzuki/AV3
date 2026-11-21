import { PublicoService } from './modules/publico/v1/publico.service';
import { IdempotenciaRepository } from './modules/publico/v1/idempotencia.repository';
import { IdempotenciaService } from './modules/publico/v1/idempotencia.service';
import { ChaveApiRepository } from './modules/auth/chaves-api/chave-api.repository';
import { ChaveApiService } from './modules/auth/chaves-api/chave-api.service';
import { ParceiroRepository } from './modules/parceiros/parceiro.repository';
import { ParceiroService } from './modules/parceiros/parceiro.service';
import type { FilaTrabalhos, ProcessarTrabalho } from './modules/fila/fila';
import { criarProcessadores } from './modules/fila/processadores';
import { TarefaRelatorioService } from './modules/tarefas/tarefa-relatorio.service';
import { criarAnalises } from './modules/analises/criar-analises';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config/env';
import type { PrismaClient } from './generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditoriaRepository } from './modules/auditoria/auditoria.repository';
import { AuditoriaService } from './modules/auditoria/auditoria.service';
import { UsuarioRepository } from './modules/usuarios/usuario.repository';
import { UsuarioService } from './modules/usuarios/usuario.service';
import { AuthService } from './modules/auth/auth.service';
import { OrganizacaoRepository } from './modules/organizacoes/organizacao.repository';
import { OrganizacaoService } from './modules/organizacoes/organizacao.service';
import { LoteRepository } from './modules/lotes/lote.repository';
import { LoteService } from './modules/lotes/lote.service';
import { EquipamentoRepository } from './modules/equipamentos/equipamento.repository';
import { EquipamentoService } from './modules/equipamentos/equipamento.service';
import { RelatorioRepository } from './modules/relatorios/relatorio.repository';
import { RelatorioService } from './modules/relatorios/relatorio.service';

export function criarContainer({ config, prisma, jwt, fila }: { config: Config; prisma: PrismaClient; jwt?: FastifyInstance['jwt']; fila: FilaTrabalhos }) {
  const auditoria = new AuditoriaService(new AuditoriaRepository(prisma));
  const usuarios = new UsuarioRepository(prisma);
  const orgs = new OrganizacaoRepository(prisma);
  const lotes = new LoteRepository(prisma);
  const equipamentos = new EquipamentoService(new EquipamentoRepository(prisma), lotes, auditoria);
  const analises = criarAnalises(prisma, auditoria, config.analiseJanelaDias, config.analiseMinAmostra);
  const tarefas = new TarefaRelatorioService(prisma, analises, fila, config, auditoria);
  const lotesService = new LoteService(lotes, orgs, equipamentos, auditoria);
  const processar: ProcessarTrabalho = criarProcessadores(prisma, config, analises, tarefas, fila);
  return {
    analises,
    tarefas,
    processar,
    parceiros: new ParceiroService(new ParceiroRepository(prisma), auditoria),
    chaves: new ChaveApiService(new ChaveApiRepository(prisma), auditoria, config.publicRateLimitPadrao, config.apiKeyRotacaoGraceHoras),
    auditoria,
    equipamentos,
    auth: new AuthService(usuarios, auditoria, config.bcryptCost, ator => jwt!.sign({ ...ator, jti: randomUUID() }), token => jwt!.verify(token)),
    usuarios: new UsuarioService(usuarios, auditoria, config.bcryptCost),
    organizacoes: new OrganizacaoService(orgs, auditoria),
    lotes: lotesService,
    publico: new PublicoService(prisma, lotesService, new IdempotenciaService(new IdempotenciaRepository(prisma), config.idempotenciaTtlHoras)),
    relatorios: new RelatorioService(new RelatorioRepository(prisma), orgs),
  };
}
