export interface PayloadJob {
  'analise.executar': { execucaoId: string };
  'relatorio.gerar': { tarefaId: string };
  'analise.agendar': Record<string, never>;
  'analise.avaliar-previsoes': Record<string, never>;
  'manutencao.limpeza': Record<string, never>;
  'manutencao.reconciliar': Record<string, never>;
}

export type NomeJob = keyof PayloadJob;
export type Trabalho = { [N in NomeJob]: { nome: N; dados: PayloadJob[N] } }[NomeJob];
