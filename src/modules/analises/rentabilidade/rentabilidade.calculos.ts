export interface ItemRentabilidade<T extends string> {
  tipo: T;
  estadoFisico: number;
  marca: string;
  modelo: string;
  peso: number;
  realizado: number | null;
}

export interface ParametroValor {
  valorBaseKg: number;
  fatoresEstado: number[];
}

type Nivel = 'TIPO' | 'TIPO_ESTADO' | 'TIPO_MARCA' | 'TIPO_MARCA_MODELO';
type Fonte = 'REALIZADO' | 'PARAMETRICO' | 'MISTO';

export function calcularRentabilidade<T extends string>(
  itens: ItemRentabilidade<T>[],
  parametros: ReadonlyMap<T, ParametroValor>,
) {
  const historico = new Map<string, { soma: number; amostra: number }>();
  const chavesEstimativa = ({ tipo, marca, modelo, estadoFisico }: ItemRentabilidade<T>) => [
    JSON.stringify([tipo, estadoFisico, marca, modelo]),
    JSON.stringify([tipo, estadoFisico, marca]),
    JSON.stringify([tipo, estadoFisico]),
  ];
  for (const item of itens) {
    if (item.realizado === null) continue;
    for (const chave of chavesEstimativa(item)) {
      const anterior = historico.get(chave) ?? { soma: 0, amostra: 0 };
      historico.set(chave, { soma: anterior.soma + item.realizado / item.peso, amostra: anterior.amostra + 1 });
    }
  }

  const grupos = new Map<string, {
    nivel: Nivel; chave: string; tipo: T; estadoFisico: number | null; marca: string | null; modelo: string | null;
    amostra: number; amostraRealizada: number; pesoTotalKg: number; valorTotalEstimado: number;
  }>();
  let valorTotalEstimado = 0;
  let totalRealizado = 0;
  for (const item of itens) {
    const { tipo, estadoFisico, marca, modelo, peso, realizado } = item;
    const referencia = chavesEstimativa(item).map(chave => historico.get(chave)).find(ref => ref && ref.amostra >= 3);
    const parametro = parametros.get(tipo);
    const valorKg = referencia ? referencia.soma / referencia.amostra : (parametro?.valorBaseKg ?? 0) * (parametro?.fatoresEstado[estadoFisico] ?? 0);
    const valor = realizado ?? valorKg * peso;
    valorTotalEstimado += valor;
    if (realizado !== null) totalRealizado++;
    const dimensoes: [Nivel, number | null, string | null, string | null][] = [
      ['TIPO', null, null, null], ['TIPO_ESTADO', estadoFisico, null, null],
      ['TIPO_MARCA', null, marca, null], ['TIPO_MARCA_MODELO', null, marca, modelo],
    ];
    for (const [nivel, estado, fabricante, linha] of dimensoes) {
      const chave = JSON.stringify([tipo, estado, fabricante, linha]);
      const grupo = grupos.get(chave) ?? {
        nivel, chave, tipo, estadoFisico: estado, marca: fabricante, modelo: linha,
        amostra: 0, amostraRealizada: 0, pesoTotalKg: 0, valorTotalEstimado: 0,
      };
      grupo.amostra++;
      if (realizado !== null) grupo.amostraRealizada++;
      grupo.pesoTotalKg += peso;
      grupo.valorTotalEstimado += valor;
      grupos.set(chave, grupo);
    }
  }
  const metricas = [...grupos.values()].map(grupo => {
    const fonte: Fonte = grupo.amostraRealizada === grupo.amostra ? 'REALIZADO' : grupo.amostraRealizada === 0 ? 'PARAMETRICO' : 'MISTO';
    return {
      ...grupo, fonte, ranking: 0,
      valorMedioUnidade: grupo.valorTotalEstimado / grupo.amostra,
      valorMedioPorKg: grupo.valorTotalEstimado / grupo.pesoTotalKg,
    };
  });
  metricas.sort((a, b) => b.valorMedioPorKg - a.valorMedioPorKg || a.chave.localeCompare(b.chave));
  const ranks = new Map<string, number>();
  for (const metrica of metricas) {
    const chave = metrica.nivel === 'TIPO_MARCA_MODELO' ? JSON.stringify([metrica.nivel, metrica.tipo]) : metrica.nivel;
    metrica.ranking = (ranks.get(chave) ?? 0) + 1;
    ranks.set(chave, metrica.ranking);
  }
  return {
    metricas,
    resumo: {
      totalEquipamentos: itens.length, valorTotalEstimado,
      percentualRealizado: itens.length ? 100 * totalRealizado / itens.length : 0,
      topTipos: metricas.filter(m => m.nivel === 'TIPO').slice(0, 3).map(({ tipo, valorMedioPorKg }) => ({ tipo, valorMedioPorKg })),
    },
  };
}
