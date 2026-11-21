import { desvioPadrao, media, mediana, percentil } from '../../../shared/estatistica';

export interface Triagem {
  entrada: Date;
  inicio: Date | null;
  conclusao: Date;
  operador: string;
}

type Dimensao = 'GERAL' | 'OPERADOR' | 'MES_ANO' | 'MES_DO_ANO';

export function calcularEficiencia(triagens: Triagem[], minAmostra: number) {
  const dados = triagens.flatMap(({ entrada, inicio, conclusao, operador }) => {
    if (!inicio) return [];
    const espera = (inicio.getTime() - entrada.getTime()) / 3600000;
    const triagem = (conclusao.getTime() - inicio.getTime()) / 3600000;
    if (espera < 0 || triagem < 0) return [];
    return [{ espera, triagem, total: espera + triagem, operador, mesAno: conclusao.toISOString().slice(0, 7) }];
  });
  const totais = dados.map(d => d.total);
  const mediaGeral = media(totais) ?? 0;
  const desvioGeral = desvioPadrao(totais) ?? 0;
  function agregar(dimensao: Dimensao, chave: string, grupo: typeof dados) {
    const duracoes = grupo.map(d => d.total);
    const tempoMedioHoras = media(duracoes) ?? 0;
    return {
      dimensao, chave, amostra: grupo.length, tempoMedioHoras,
      medianaHoras: mediana(duracoes) ?? 0,
      desvioPadraoHoras: desvioPadrao(duracoes) ?? 0,
      p90Horas: percentil(duracoes, 0.9) ?? 0,
      esperaMediaHoras: media(grupo.map(d => d.espera)) ?? 0,
      triagemMediaHoras: media(grupo.map(d => d.triagem)) ?? 0,
      indiceSazonal: dimensao === 'MES_DO_ANO' && mediaGeral > 0 ? tempoMedioHoras / mediaGeral : null,
      gargalo: grupo.length >= minAmostra && tempoMedioHoras > mediaGeral + desvioGeral,
    };
  }
  const geral = agregar('GERAL', 'todos', dados);
  const metricas = [geral];
  const dimensoes: [Dimensao, (linha: typeof dados[number]) => string][] = [
    ['OPERADOR', d => d.operador],
    ['MES_ANO', d => d.mesAno],
    ['MES_DO_ANO', d => d.mesAno.slice(5)],
  ];
  for (const [dimensao, chaveDe] of dimensoes) {
    const grupos = new Map<string, typeof dados>();
    for (const linha of dados) {
      const chave = chaveDe(linha);
      const grupo = grupos.get(chave);
      if (grupo) grupo.push(linha);
      else grupos.set(chave, [linha]);
    }
    for (const [chave, grupo] of grupos) metricas.push(agregar(dimensao, chave, grupo));
  }
  const { tempoMedioHoras, medianaHoras, desvioPadraoHoras, p90Horas, esperaMediaHoras, triagemMediaHoras } = geral;
  return {
    metricas,
    resumo: {
      totalLotes: dados.length, descartados: triagens.length - dados.length,
      tempoMedioHoras, medianaHoras, desvioPadraoHoras, p90Horas, esperaMediaHoras, triagemMediaHoras,
      gargaloEtapa: dados.length === 0 ? null : (esperaMediaHoras >= triagemMediaHoras ? 'ESPERA' : 'TRIAGEM'),
      operadoresSinalizados: metricas.filter(m => m.dimensao === 'OPERADOR' && m.gargalo).map(m => m.chave),
    },
  };
}
