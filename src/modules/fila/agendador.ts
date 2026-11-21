import type { Config } from '../../config/env';
import { BullMQFila } from './bullmq.fila';

export async function registrarAgendamento(fila: BullMQFila, config: Config) {
  await fila.queue.upsertJobScheduler('analises-diarias', { pattern: config.analiseCron, tz: config.analiseTz }, { name: 'analise.agendar', data: {} });
  await fila.queue.upsertJobScheduler('limpeza-diaria', { pattern: '30 3 * * *', tz: config.analiseTz }, { name: 'manutencao.limpeza', data: {} });
  await fila.queue.upsertJobScheduler('reconciliacao', { every: 600000 }, { name: 'manutencao.reconciliar', data: {} });
  await fila.enfileirar('manutencao.reconciliar', {}, { jobId: 'reconciliacao-inicial' });
}
