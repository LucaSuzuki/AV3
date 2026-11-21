import { linearRegression, linearRegressionLine, mean, median, quantile, rSquared, sampleStandardDeviation } from 'simple-statistics';

export const media = (valores: number[]) => valores.length ? mean(valores) : null;
export const mediana = (valores: number[]) => valores.length ? median(valores) : null;
export const desvioPadrao = (valores: number[]) => valores.length >= 2 ? sampleStandardDeviation(valores) : null;
export const percentil = (valores: number[], p: number) => valores.length ? quantile(valores, p) : null;

export function regressaoLinear(pontos: [number, number][]) {
  const n = pontos.length;
  if (n < 2 || pontos.every(([x]) => x === pontos[0][0]) || pontos.every(([, y]) => y === pontos[0][1])) return null;
  const modelo = linearRegression(pontos);
  const prever = linearRegressionLine(modelo);
  const somaQuadrados = pontos.reduce((soma, [x, y]) => soma + (y - prever(x)) ** 2, 0);
  return {
    inclinacao: modelo.m,
    intercepto: modelo.b,
    r2: rSquared(pontos, prever),
    erroPadraoResidual: n > 2 ? Math.sqrt(somaQuadrados / (n - 2)) : null,
    n,
  };
}
