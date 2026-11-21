import type { PrismaClient } from '../../generated/prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AnalisesRepository } from './analises.repository';
import { AnalisesService } from './analises.service';
import { EficienciaRepository } from './eficiencia/eficiencia.repository';
import { EficienciaService } from './eficiencia/eficiencia.service';
import { RentabilidadeRepository } from './rentabilidade/rentabilidade.repository';
import { RentabilidadeService } from './rentabilidade/rentabilidade.service';
import { VidaUtilRepository } from './vida-util/vida-util.repository';
import { VidaUtilService } from './vida-util/vida-util.service';

export function criarAnalises(prisma: PrismaClient, auditoria: AuditoriaService, janelaDias: number, minAmostra: number) {
  return new AnalisesService(
    prisma, new AnalisesRepository(prisma), auditoria, janelaDias,
    new EficienciaService(new EficienciaRepository(prisma), minAmostra),
    new RentabilidadeService(new RentabilidadeRepository(prisma)),
    new VidaUtilService(new VidaUtilRepository(prisma), minAmostra),
  );
}
