export function atrasoRetry(base: number, tentativa: number) {
  return base * 2 ** (tentativa - 1);
}

export const retencaoJobs = {
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 86400 },
};
