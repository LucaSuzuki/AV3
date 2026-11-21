import 'dotenv/config';
import { hash } from 'bcryptjs';
import { criarPrisma } from '../src/plugins/prisma';
import { PrismaClient, PapelUsuario, StatusLote, TipoEquipamento, StatusRastreamento } from '../src/generated/prisma/client';

export async function seed(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  if (!env.SEED_ADMIN_PASSWORD || env.SEED_ADMIN_PASSWORD.length < 12) throw new Error('Defina SEED_ADMIN_PASSWORD com pelo menos 12 caracteres.');
  if (Buffer.byteLength(env.SEED_ADMIN_PASSWORD, 'utf8') > 72) throw new Error('SEED_ADMIN_PASSWORD ultrapassa 72 bytes UTF-8.');
  const usuarios: { usuario: string; senha: string; papel: PapelUsuario }[] = [{ usuario: env.SEED_ADMIN_USER ?? 'admin', senha: env.SEED_ADMIN_PASSWORD, papel: PapelUsuario.ADMINISTRADOR }];
  if (env.NODE_ENV !== 'production') usuarios.push(
    { usuario: 'operador', senha: 'Operador-AV2-2026!', papel: PapelUsuario.OPERADOR_CADASTRO },
    { usuario: 'almoxarife', senha: 'Almoxarife-AV2-2026!', papel: PapelUsuario.GESTOR_ALMOXARIFADO },
    { usuario: 'almoxarife2', senha: 'Almoxarife2-AV3-2026!', papel: PapelUsuario.GESTOR_ALMOXARIFADO },
    { usuario: 'auditor', senha: 'Auditor-AV2-2026!', papel: PapelUsuario.AUDITORIA },
  );
  const custo = Number(env.BCRYPT_COST ?? 12);
  if (!Number.isInteger(custo) || custo < 10 || custo > 16) throw new Error('BCRYPT_COST inválido.');
  await db.$transaction(async tx => {
    for (const u of usuarios) await tx.usuario.upsert({ where: { usuario: u.usuario }, update: {}, create: { usuario: u.usuario, papel: u.papel, hashSenha: await hash(u.senha, custo) } });
    const valoresBase: Record<TipoEquipamento, number> = {
      NOTEBOOK: 18, COMPUTADOR_MESA: 12, MONITOR: 8, IMPRESSORA: 6,
      SERVIDOR: 25, ROTEADOR: 10, CABO_ESTRUTURADO: 15, FONTE_ALIMENTACAO: 9,
    };
    for (const tipo of Object.values(TipoEquipamento)) {
      await tx.parametroRecuperacao.upsert({
        where: { tipo }, update: {},
        create: { tipo, valorBaseKg: valoresBase[tipo], fatoresEstado: [1, 0.9, 0.75, 0.6, 0.4, 0.2, 0.05] },
      });
    }
    if (env.NODE_ENV === 'production') return;
    const agora = new Date();
    const dias = (n: number) => new Date(agora.getTime() + n * 86400000);
    const cnpjs = ['12345678000195', '11222333000181', '11444777000161', '45723174000110'];
    const orgs = [];
    for (let i = 0; i < cnpjs.length; i++) orgs.push(await tx.organizacao.upsert({ where: { cnpj: cnpjs[i] }, update: {}, create: {
      razaoSocial: `Organização Exemplo ${i + 1}`, cnpj: cnpjs[i], inscricaoEstadual: `IE${i + 1}`,
      enderecoCompleto: `Rua Exemplo, ${i + 1}`, telefone: '11999999999', email: `contato${i + 1}@exemplo.com`, ativo: i !== 3,
    } }));
    for (let i = 0; i < 2; i++) await tx.contrato.upsert({ where: { organizacaoId: orgs[i].id }, update: {}, create: {
      organizacaoId: orgs[i].id, dataAssinatura: dias(-30), dataVencimento: dias(i === 0 ? 365 : -1),
      valorMensal: (i + 1) * 150, clausulas: ['Coleta e destinação responsável'], renovacaoAutomatica: i === 0,
    } });
    const estados = Object.values(StatusLote);
    const lotes = [];
    for (let i = 0; i < estados.length; i++) lotes.push(await tx.lote.upsert({
      where: { id: `00000000-0000-4000-8000-00000000000${i + 1}` }, update: {}, create: {
        id: `00000000-0000-4000-8000-00000000000${i + 1}`, organizacaoId: orgs[i % 3].id,
        dataEntrada: dias(-[2, 15, 45, 85, 85][i]), notaFiscal: `SEED-NF-${i + 1}`, transportadora: 'Logística Verde', statusProcessamento: estados[i],
      },
    }));
    if (env.NODE_ENV !== 'production') {
      await tx.parceiro.upsert({
        where: { nome: 'Parceiro Exemplo' }, update: {},
        create: { nome: 'Parceiro Exemplo', organizacaoId: orgs[0].id, contatoEmail: 'parceiro@exemplo.com' },
      });
      for (const [indice, lote] of lotes.entries()) {
        if (await tx.transicaoLote.findFirst({ where: { loteId: lote.id } })) continue;
        await tx.transicaoLote.createMany({
          data: estados.slice(0, estados.indexOf(lote.statusProcessamento) + 1).map((statusNovo, passo) => ({
            loteId: lote.id, statusNovo, statusAnterior: estados[passo - 1] ?? null,
            usuario: passo === 0 ? 'operador' : (indice % 2 === 0 ? 'almoxarife' : 'almoxarife2'),
            dataHora: new Date(lote.dataEntrada.getTime() + passo * (indice + 1) * 3600000),
          })),
        });
      }
    }
    const status = Object.values(StatusRastreamento);
    const tipos = Object.values(TipoEquipamento);
    for (let i = 0; i < tipos.length; i++) {
      const lote = lotes[[0, 1, 2, 2, 3, 3, 4, 4][i]];
      const equipamento = await tx.equipamento.upsert({ where: { codigoBarrasInterno: `${tipos[i]}-${String(i + 1).padStart(6, '0')}` }, update: {}, create: {
        codigoBarrasInterno: `${tipos[i]}-${String(i + 1).padStart(6, '0')}`, tipo: tipos[i], marca: 'Exemplo', modelo: `Eco ${i + 1}`,
        anoFabricacao: 2018 + i, estadoFisico: i % 7, pesoQuilogramas: 1.5 + i, loteId: lote.id, posicaoNoLote: i + 1, statusRastreamento: status[i],
      } });
      // Não atualiza movimentações existentes: a trilha é imutável também no seed.
      if (!await tx.movimentacao.findFirst({ where: { equipamentoId: equipamento.id } })) {
        const caminho: StatusRastreamento[] = ['AGUARDANDO_TRIAGEM', 'EM_TRIAGEM', 'AGUARDANDO_DESMONTE', 'EM_DESMONTE'];
        if (i >= 4) caminho.push(status[i] === 'BAIXA_DEFINITIVA' ? 'DESCARTE_SEGURO' : status[i]);
        if (i === 7) caminho.push('BAIXA_DEFINITIVA');
        const final = caminho.indexOf(status[i]);
        let origem = 'CADASTRO';
        let passo = 0;
        for (const destino of caminho.slice(0, final + 1)) {
          await tx.movimentacao.create({ data: { equipamentoId: equipamento.id, origem, destino, responsavel: usuarios[0].usuario, dataHora: new Date(lote.dataEntrada.getTime() + passo++ * 60000), observacao: 'Histórico demonstrativo de triagem e destinação' } });
          origem = destino;
        }
        if (i >= 2) await tx.movimentacao.create({ data: { equipamentoId: equipamento.id, origem: '0', destino: String(i % 7), responsavel: usuarios[0].usuario, dataHora: new Date(lote.dataEntrada.getTime() + passo * 60000), observacao: 'Inspeção constatou desgaste e avarias; reclassificação justificada.' } });
      }
    }

    if (env.NODE_ENV !== 'test') {
      for (let mes = 1; mes <= 12; mes++) {
        const lote = await tx.lote.upsert({
          where: { id: `00000000-0000-4000-8001-${String(mes).padStart(12, '0')}` },
          update: {},
          create: {
            id: `00000000-0000-4000-8001-${String(mes).padStart(12, '0')}`,
            organizacaoId: orgs[(mes - 1) % 3].id, dataEntrada: dias(-(mes * 30 - 15)),
            notaFiscal: `SEED-AV3-${mes}`, transportadora: 'Logística Verde', statusProcessamento: 'TRIAGEM_CONCLUIDA',
          },
        });
        if (!await tx.transicaoLote.findFirst({ where: { loteId: lote.id, statusNovo: 'EM_TRIAGEM' } })) {
          const entrada = lote.dataEntrada.getTime();
          const operador = mes % 2 ? 'almoxarife' : 'almoxarife2';
          const transicoes = [
            { statusNovo: StatusLote.RECEBIDO, usuario: 'operador', dataHora: lote.dataEntrada },
            { statusAnterior: StatusLote.RECEBIDO, statusNovo: StatusLote.EM_TRIAGEM, usuario: operador, dataHora: new Date(entrada + mes * 3600000) },
            { statusAnterior: StatusLote.EM_TRIAGEM, statusNovo: StatusLote.TRIAGEM_CONCLUIDA, usuario: operador, dataHora: new Date(entrada + (mes * 2 + 6) * 3600000) },
          ];
          if (await tx.transicaoLote.findFirst({ where: { loteId: lote.id, statusNovo: 'RECEBIDO' } })) transicoes.shift();
          await tx.transicaoLote.createMany({ data: transicoes.map(transicao => ({ ...transicao, loteId: lote.id })) });
        }
        for (let posicao = 1; posicao <= 5; posicao++) {
          const indice = (mes - 1) * 5 + posicao - 1;
          const codigoBarrasInterno = `SEED-AV3-${String(indice + 1).padStart(4, '0')}`;
          if (await tx.equipamento.findUnique({ where: { codigoBarrasInterno }, select: { id: true } })) continue;
          const anoFabricacao = 2012 + (indice * 5) % 14;
          const idade = lote.dataEntrada.getUTCFullYear() - anoFabricacao;
          const estadoFisico = Math.max(0, Math.min(6, Math.round(idade * 0.43 + (indice % 3) - 1)));
          const realizado = indice % 5 < 2;
          const equipamento = await tx.equipamento.create({
            data: {
              codigoBarrasInterno, loteId: lote.id, posicaoNoLote: posicao, tipo: tipos[indice % tipos.length],
              marca: ['Acer', 'Dell', 'Lenovo'][indice % 3], modelo: `Eco ${1 + indice % 4}`,
              anoFabricacao, estadoFisico, pesoQuilogramas: 1 + posicao,
              statusRastreamento: realizado ? 'MATERIAL_RECICLAVEL' : 'AGUARDANDO_DESMONTE',
              valorRecuperadoReal: realizado ? (1 + posicao) * (4 + indice % 6) : null,
              valorRecuperadoEm: realizado ? new Date(lote.dataEntrada.getTime() + 3 * 86400000) : null,
            },
          });
          const cadeia = ['AGUARDANDO_TRIAGEM', 'EM_TRIAGEM', 'AGUARDANDO_DESMONTE'];
          if (realizado) cadeia.push('EM_DESMONTE', 'MATERIAL_RECICLAVEL');
          const movimentos = cadeia.map((destino, passo) => ({
            equipamentoId: equipamento.id, destino, origem: cadeia[passo - 1] ?? 'CADASTRO',
            dataHora: new Date(lote.dataEntrada.getTime() + (36 + passo) * 3600000),
            responsavel: passo === 0 ? 'operador' : 'almoxarife', observacao: 'Histórico demonstrativo da AV3',
          }));
          if (estadoFisico === 6) movimentos.push({
            equipamentoId: equipamento.id, origem: '4', destino: '6',
            dataHora: new Date(lote.dataEntrada.getTime() + 48 * 3600000),
            responsavel: 'almoxarife', observacao: 'Inspeção confirmou que o equipamento está inservível.',
          });
          await tx.movimentacao.createMany({ data: movimentos });
        }
      }
    }
  }, { timeout: 60000 });
}

if (require.main === module) {
  const db = criarPrisma(process.env.DATABASE_URL ?? '');
  seed(db).then(() => console.log('Seed concluído.')).catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => db.$disconnect());
}
