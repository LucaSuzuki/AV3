import type { ExecucaoAnalise, PrismaClient, TarefaRelatorio } from '../../generated/prisma/client';
import { linhaCsv, serializarCsv } from '../../shared/csv';
import { ErroNaoRecuperavel } from '../fila/erros';

const colunas = {
  EFICIENCIA: ['dimensao', 'chave', 'amostra', 'tempoMedioHoras', 'medianaHoras', 'desvioPadraoHoras', 'p90Horas', 'esperaMediaHoras', 'triagemMediaHoras', 'indiceSazonal', 'gargalo'],
  RENTABILIDADE: ['nivel', 'tipo', 'estadoFisico', 'marca', 'modelo', 'amostra', 'amostraRealizada', 'pesoTotalKg', 'valorMedioUnidade', 'valorMedioPorKg', 'valorTotalEstimado', 'fonte', 'ranking'],
  VIDA_UTIL: ['codigoBarras', 'tipo', 'marca', 'modelo', 'idadeAtualAnos', 'estadoFisico', 'vidaRemanescenteAnos', 'dataPrevistaInservivel', 'confianca'],
};

export class GeradorRelatorio {
  constructor(private prisma: PrismaClient, private maxBytes: number) {}

  async gerar(tarefa: TarefaRelatorio, execucao: ExecucaoAnalise) {
    const campos = colunas[tarefa.tipo];
    let resumo = execucao.resumo;
    if (tarefa.parceiroId && tarefa.tipo === 'EFICIENCIA' && resumo && typeof resumo === 'object' && !Array.isArray(resumo)) {
      const { operadoresSinalizados: _operadores, ...publico } = resumo;
      resumo = publico;
    }
    const meta = { tipo: tarefa.tipo, formato: tarefa.formato, geradoEm: new Date(), periodo: execucao.parametros, organizacaoId: tarefa.organizacaoId, versaoModelo: execucao.versaoModelo };
    const csv = tarefa.formato === 'CSV';
    const partes = [csv ? serializarCsv(campos, []) : JSON.stringify({ meta, resumo }).slice(0, -1) + ',"dados":['];
    let tamanho = Buffer.byteLength(partes[0]);
    let quantidade = 0;
    for await (const linha of this.linhas(tarefa, execucao.id)) {
      const parte = csv
        ? linhaCsv(campos.map(campo => linha[campo] ?? null))
        : (quantidade ? ',' : '') + JSON.stringify(linha);
      tamanho += Buffer.byteLength(parte);
      if (tamanho + (csv ? 0 : 2) > this.maxBytes) throw new ErroNaoRecuperavel('Relatório grande demais. Reduza o período.');
      partes.push(parte);
      quantidade++;
    }
    if (!csv) partes.push(']}');
    const conteudo = Buffer.from(partes.join(''));
    if (conteudo.length > this.maxBytes) throw new ErroNaoRecuperavel('Relatório grande demais. Reduza o período.');
    const extensao = tarefa.formato.toLowerCase();
    return { conteudo, tamanhoBytes: conteudo.length, nomeArquivo: tarefa.tipo.toLowerCase() + '-' + tarefa.id + '.' + extensao, tipoConteudo: csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8' };
  }

  private async *linhas(tarefa: TarefaRelatorio, execucaoId: string): AsyncGenerator<Record<string, string | number | boolean | Date | null>> {
    let id: string | undefined;
    for (;;) {
      const paginar = { take: 1000, ...(id ? { cursor: { id }, skip: 1 } : {}), orderBy: { id: 'asc' as const } };
      if (tarefa.tipo === 'EFICIENCIA') {
        const linhas = await this.prisma.metricaEficiencia.findMany({ ...paginar, where: { execucaoId, dimensao: tarefa.parceiroId ? { not: 'OPERADOR' } : undefined } });
        for (const m of linhas) yield {
          dimensao: m.dimensao, chave: m.chave, amostra: m.amostra, tempoMedioHoras: m.tempoMedioHoras.toNumber(), medianaHoras: m.medianaHoras.toNumber(),
          desvioPadraoHoras: m.desvioPadraoHoras.toNumber(), p90Horas: m.p90Horas.toNumber(), esperaMediaHoras: m.esperaMediaHoras.toNumber(),
          triagemMediaHoras: m.triagemMediaHoras.toNumber(), indiceSazonal: m.indiceSazonal?.toNumber() ?? null, gargalo: m.gargalo,
        };
        id = linhas[linhas.length - 1]?.id;
        if (linhas.length < paginar.take) return;
      } else if (tarefa.tipo === 'RENTABILIDADE') {
        const linhas = await this.prisma.metricaRentabilidade.findMany({ ...paginar, where: { execucaoId } });
        for (const m of linhas) yield {
          nivel: m.nivel, tipo: m.tipo, estadoFisico: m.estadoFisico, marca: m.marca, modelo: m.modelo, amostra: m.amostra, amostraRealizada: m.amostraRealizada,
          pesoTotalKg: m.pesoTotalKg.toNumber(), valorMedioUnidade: m.valorMedioUnidade.toNumber(), valorMedioPorKg: m.valorMedioPorKg.toNumber(),
          valorTotalEstimado: m.valorTotalEstimado.toNumber(), fonte: m.fonte, ranking: m.ranking,
        };
        id = linhas[linhas.length - 1]?.id;
        if (linhas.length < paginar.take) return;
      } else {
        const linhas = await this.prisma.previsaoVidaUtil.findMany({ ...paginar, where: { execucaoId }, include: {
          equipamento: { select: { codigoBarrasInterno: true, tipo: true, marca: true, modelo: true } },
          modelo: { select: { confianca: true } },
        } });
        for (const m of linhas) yield {
          codigoBarras: m.equipamento.codigoBarrasInterno, tipo: m.equipamento.tipo, marca: m.equipamento.marca, modelo: m.equipamento.modelo,
          idadeAtualAnos: m.idadeAtualAnos, estadoFisico: m.estadoFisicoAtual, vidaRemanescenteAnos: m.vidaRemanescenteAnos.toNumber(),
          dataPrevistaInservivel: m.dataPrevistaInservivel, confianca: m.modelo.confianca,
        };
        id = linhas[linhas.length - 1]?.id;
        if (linhas.length < paginar.take) return;
      }
    }
  }
}
