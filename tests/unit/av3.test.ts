import { calcularRentabilidade } from '../../src/modules/analises/rentabilidade/rentabilidade.calculos';
import { calcularVidaUtil } from '../../src/modules/analises/vida-util/vida-util.calculos';
import { gerarChaveApi, parsearChaveApi } from '../../src/modules/auth/chaves-api/chave-api.util';
import { hashesIguais } from '../../src/shared/hash';
import { serializarCsv } from '../../src/shared/csv';
import { FilaInline } from '../../src/modules/fila/inline.fila';
import { ErroNaoRecuperavel } from '../../src/modules/fila/erros';

test('rentabilidade usa comparáveis antes dos parâmetros e separa o realizado', () => {
  const base = { tipo: 'NOTEBOOK', estadoFisico: 2, marca: 'A', modelo: 'B', peso: 2 };
  const { metricas, resumo } = calcularRentabilidade([
    { ...base, realizado: 14 }, { ...base, realizado: 16 }, { ...base, realizado: 18 },
    { ...base, modelo: 'C', realizado: null },
    { ...base, estadoFisico: 0, realizado: null },
  ], new Map([['NOTEBOOK', { valorBaseKg: 10, fatoresEstado: [1, 0.9, 0.7] }]]));
  expect(resumo.valorTotalEstimado).toBe(84);
  expect(metricas.find(m => m.nivel === 'TIPO')).toMatchObject({ amostra: 5, amostraRealizada: 3, fonte: 'MISTO', ranking: 1 });
});

test('vida útil usa inclinação positiva, fallback e exclui itens já inservíveis', () => {
  const agora = new Date(Date.UTC(2026, 0, 1));
  const itens = [
    { id: 'a', tipo: 'A', anoFabricacao: 2024, dataEntrada: agora, estadoFisico: 1, baixado: false },
    { id: 'b', tipo: 'A', anoFabricacao: 2022, dataEntrada: agora, estadoFisico: 2, baixado: false },
    { id: 'c', tipo: 'A', anoFabricacao: 2014, dataEntrada: agora, estadoFisico: 6, baixado: false },
    { id: 'd', tipo: 'B', anoFabricacao: 2020, dataEntrada: agora, estadoFisico: 3, baixado: false },
  ];
  const { modelos, previsoes } = calcularVidaUtil(itens, ['A', 'B'], 3, agora);
  expect(modelos.find(m => m.tipo === 'B')).toMatchObject({ origemModelo: 'AGREGADO_GERAL', confianca: 'BAIXA', inclinacao: 0.5 });
  expect(previsoes.find(p => p.equipamentoId === 'd')?.vidaRemanescenteAnos).toBe(6);
  expect(previsoes.some(p => p.equipamentoId === 'c')).toBe(false);
});

test('segredo da chave não aparece no hash e CSV protege as células de texto', () => {
  const criada = gerarChaveApi();
  expect(criada.chave).toMatch(/^gck_[0-9a-f]{10}\.[A-Za-z0-9_-]{43}$/);
  expect(hashesIguais(parsearChaveApi(criada.chave)!.hashChave, criada.hashChave)).toBe(true);
  expect(parsearChaveApi('inválida')).toBeNull();
  expect(serializarCsv(['A', 'B', 'C'], [['=SUM(1,2)', -4, 'com "aspas"']])).toBe('\uFEFFA,B,C\r\n"\'=SUM(1,2)",-4,"com ""aspas"""\r\n');
});

test('fila inline aplica retries e encerra erros definitivos de imediato', async () => {
  const tentativas: number[] = [];
  const definitivas: number[] = [];
  const fila = new FilaInline(async (trabalho, tentativa) => {
    if (trabalho.nome !== 'analise.executar') return;
    if (trabalho.dados.execucaoId === 'definitiva') {
      definitivas.push(tentativa);
      throw new ErroNaoRecuperavel('Entrada inválida.');
    }
    tentativas.push(tentativa);
    if (tentativa < 3) throw new Error('Falha transitória.');
  }, 3, 1);
  await fila.enfileirar('analise.executar', { execucaoId: 'transitoria' });
  await fila.enfileirar('analise.executar', { execucaoId: 'definitiva' });
  await fila.aguardarOciosa();
  expect(tentativas).toEqual([1, 2, 3]);
  expect(definitivas).toEqual([1]);
  await fila.fechar();
});
