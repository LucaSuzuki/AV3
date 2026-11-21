import { parseArgs } from 'node:util';
import { lerEnv } from '../src/config/env';
import { TipoAnalise } from '../src/generated/prisma/client';
import { AuditoriaRepository } from '../src/modules/auditoria/auditoria.repository';
import { AuditoriaService } from '../src/modules/auditoria/auditoria.service';
import { criarAnalises } from '../src/modules/analises/criar-analises';
import { AvaliacaoPrevisoesService } from '../src/modules/analises/vida-util/avaliacao.service';
import { criarPrisma } from '../src/plugins/prisma';

async function main() {
  const { values } = parseArgs({ options: {
    tipo: { type: 'string', default: 'todas' },
    inicio: { type: 'string' },
    fim: { type: 'string' },
    organizacao: { type: 'string' },
    avaliar: { type: 'boolean' },
  } });
  const tiposPorNome: Record<string, TipoAnalise> = { eficiencia: 'EFICIENCIA', rentabilidade: 'RENTABILIDADE', 'vida-util': 'VIDA_UTIL' };
  const tipos = values.tipo === 'todas' ? Object.values(TipoAnalise) : [tiposPorNome[values.tipo!]];
  if (!tipos.every(tipo => Object.values(TipoAnalise).includes(tipo))) throw new Error('Tipo inválido.');
  const config = lerEnv({ ...process.env, QUEUE_MODE: 'inline' });
  const prisma = criarPrisma(config.databaseUrl);
  try {
    if (values.avaliar) {
      const avaliadas = await new AvaliacaoPrevisoesService(prisma).avaliar();
      console.log(JSON.stringify({ avaliadas }));
      return;
    }
    const auditoria = new AuditoriaService(new AuditoriaRepository(prisma));
    const analises = criarAnalises(prisma, auditoria, config.analiseJanelaDias, config.analiseMinAmostra);
    for (const tipo of tipos) {
      const execucao = await analises.criarExecucao(tipo, { inicio: values.inicio, fim: values.fim, organizacaoId: values.organizacao }, 'MANUAL', 'script:analises');
      console.log(JSON.stringify(await analises.executar(execucao.id)));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(erro => {
  console.error(erro instanceof Error ? erro.message : 'Falha ao executar análises.');
  process.exitCode = 1;
});
