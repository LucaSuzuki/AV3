import { regressaoLinear } from '../../../shared/estatistica';

const DIA_MS = 86_400_000;

export interface ItemVidaUtil<T extends string> {
  id: string;
  tipo: T;
  anoFabricacao: number;
  dataEntrada: Date;
  estadoFisico: number;
  baixado: boolean;
}

type Confianca = 'ALTA' | 'MEDIA' | 'BAIXA' | 'INSUFICIENTE';

export function calcularVidaUtil<T extends string>(
  itens: ItemVidaUtil<T>[],
  tipos: readonly T[],
  minAmostra: number,
  agora: Date,
) {
  function ajustar(grupo: ItemVidaUtil<T>[]) {
    const regressao = regressaoLinear(grupo.map(item => [
      Math.max(0, item.dataEntrada.getUTCFullYear() - item.anoFabricacao),
      item.estadoFisico,
    ]));
    return regressao && grupo.length >= minAmostra && regressao.inclinacao > 0 ? regressao : null;
  }
  const geral = ajustar(itens);
  function modelo(tipo: T | null, grupo: ItemVidaUtil<T>[], proprio: ReturnType<typeof ajustar>) {
    const ajuste = proprio ?? geral;
    const origemModelo = !proprio && tipo !== null && geral ? 'AGREGADO_GERAL' : 'PROPRIO';
    let confianca: Confianca = 'INSUFICIENTE';
    if (ajuste) {
      confianca = 'BAIXA';
      if (origemModelo === 'PROPRIO') {
        if (ajuste.n >= 30 && ajuste.r2 >= 0.6) confianca = 'ALTA';
        else if (ajuste.n >= 15 && ajuste.r2 >= 0.3) confianca = 'MEDIA';
      }
    }
    return {
      tipo, chave: tipo ?? 'GERAL', origemModelo, confianca,
      amostra: ajuste?.n ?? grupo.length,
      intercepto: ajuste?.intercepto ?? 0,
      inclinacao: ajuste?.inclinacao ?? 0,
      r2: ajuste?.r2 ?? 0,
      erroPadraoResidual: ajuste?.erroPadraoResidual ?? 0,
      taxaDanificados: grupo.length ? grupo.filter(item => item.estadoFisico >= 5).length / grupo.length : 0,
      idadeInservivelAnos: ajuste ? (6 - ajuste.intercepto) / ajuste.inclinacao : null,
    };
  }

  const porTipo = new Map(tipos.map(tipo => {
    const grupo = itens.filter(item => item.tipo === tipo);
    return [tipo, modelo(tipo, grupo, ajustar(grupo))] as const;
  }));
  const modelos = [modelo(null, itens, geral), ...porTipo.values()];
  const previsoes = itens.flatMap(item => {
    const estimativa = porTipo.get(item.tipo);
    if (!estimativa?.inclinacao || item.baixado || item.estadoFisico >= 6) return [];
    const vidaRemanescenteAnos = Math.min(50, (6 - item.estadoFisico) / estimativa.inclinacao);
    return [{
      chaveModelo: estimativa.chave,
      equipamentoId: item.id,
      idadeAtualAnos: Math.max(0, agora.getUTCFullYear() - item.anoFabricacao),
      estadoFisicoAtual: item.estadoFisico,
      vidaRemanescenteAnos,
      dataPrevistaInservivel: new Date(agora.getTime() + vidaRemanescenteAnos * 365.25 * DIA_MS),
      geradoEm: agora,
    }];
  });
  return {
    modelos,
    previsoes,
    resumo: {
      totalPrevisoes: previsoes.length,
      modelos: modelos.map(({ tipo, amostra, r2, confianca, origemModelo }) => ({ tipo, n: amostra, r2, confianca, origemModelo })),
      semModelo: [...porTipo.values()].filter(m => m.confianca === 'INSUFICIENTE').map(m => m.tipo),
    },
  };
}
