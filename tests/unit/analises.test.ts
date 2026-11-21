import { desvioPadrao, media, mediana, percentil, regressaoLinear } from '../../src/shared/estatistica';
import { calcularEficiencia } from '../../src/modules/analises/eficiencia/eficiencia.calculos';

test('estatísticas e regressão de uma reta de inclinação 2', () => {
  expect(media([1, 2, 3])).toBe(2);
  expect(mediana([5, 1, 3])).toBe(3);
  expect(desvioPadrao([1, 2, 3])).toBe(1);
  expect(percentil([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
  expect(regressaoLinear([[0, 1], [1, 3], [2, 5]])).toEqual({
    inclinacao: 2, intercepto: 1, r2: 1, erroPadraoResidual: 0, n: 3,
  });
});

test('séries insuficientes ou sem variação retornam null', () => {
  expect(media([])).toBeNull();
  expect(desvioPadrao([1])).toBeNull();
  expect(regressaoLinear([[1, 2]])).toBeNull();
  expect(regressaoLinear([[1, 2], [1, 3]])).toBeNull();
  expect(regressaoLinear([[1, 2], [2, 2]])).toBeNull();
});

test('eficiência distingue espera e triagem, descarta inconsistências e agrega por mês', () => {
  const hora = (valor: number) => new Date(Date.UTC(2026, 8, 2, valor));
  const triagens = [
    { entrada: hora(0), inicio: hora(2), conclusao: hora(3), operador: 'ana' },
    { entrada: hora(0), inicio: hora(4), conclusao: hora(6), operador: 'rui' },
    { entrada: hora(2), inicio: hora(1), conclusao: hora(3), operador: 'rui' },
    { entrada: hora(0), inicio: null, conclusao: hora(2), operador: 'rui' },
  ];
  const { resumo, metricas } = calcularEficiencia(triagens, 1);
  expect(resumo).toMatchObject({ totalLotes: 2, descartados: 2, esperaMediaHoras: 3, triagemMediaHoras: 1.5, gargaloEtapa: 'ESPERA' });
  expect(metricas).toEqual(expect.arrayContaining([
    expect.objectContaining({ dimensao: 'MES_ANO', chave: '2026-09', tempoMedioHoras: 4.5 }),
    expect.objectContaining({ dimensao: 'MES_DO_ANO', chave: '09', indiceSazonal: 1 }),
  ]));
});
