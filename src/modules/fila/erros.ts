import { AppError } from '../../shared/errors';

export class ErroNaoRecuperavel extends Error {}

export function recuperavel(erro: unknown) {
  return !(erro instanceof ErroNaoRecuperavel || (erro instanceof AppError && erro.statusCode >= 400 && erro.statusCode < 500));
}

export function mensagemSegura(erro: unknown) {
  if (!recuperavel(erro) && erro instanceof Error) return erro.message.slice(0, 500);
  return 'Falha ao processar o trabalho.';
}
