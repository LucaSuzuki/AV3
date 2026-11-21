import { randomBytes } from 'node:crypto';
import { sha256 } from '../../../shared/hash';

export function gerarChaveApi() {
  const prefixo = 'gck_' + randomBytes(5).toString('hex');
  const segredo = randomBytes(32).toString('base64url');
  return { prefixo, hashChave: sha256(segredo), chave: prefixo + '.' + segredo };
}

export function parsearChaveApi(chave: unknown) {
  if (typeof chave !== 'string' || !/^gck_[0-9a-f]{10}\.[A-Za-z0-9_-]{43}$/.test(chave)) return null;
  const [prefixo, segredo] = chave.split('.');
  return { prefixo, hashChave: sha256(segredo) };
}
