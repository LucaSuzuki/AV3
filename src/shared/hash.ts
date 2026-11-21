import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256(valor: string) {
  return createHash('sha256').update(valor).digest('hex');
}

export function hashesIguais(a: string, b: string) {
  const primeiro = Buffer.from(a, 'hex');
  const segundo = Buffer.from(b, 'hex');
  return primeiro.length === 32 && segundo.length === 32 && timingSafeEqual(primeiro, segundo);
}
