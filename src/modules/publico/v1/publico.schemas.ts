import { erroSchema, objeto, paginacao, respostaPagina, schema, texto, uuid } from '../../../shared/schemas';
import { equipamentoCampos, statusRastreamentoSchema, tipoSchema } from '../../equipamentos/equipamento.schemas';
import { loteCampos, statusLoteSchema } from '../../lotes/lote.schemas';

const { organizacaoId: _tenant, ...camposLote } = loteCampos;
export const textoDescrito = (description: string) => ({ ...texto, description });
const camposEquipamento = {
  codigoBarrasInterno: { ...equipamentoCampos.codigoBarrasInterno, description: 'Código de barras único do equipamento.' },
  tipo: { ...equipamentoCampos.tipo, description: 'Categoria do equipamento.' },
  marca: { ...equipamentoCampos.marca, description: 'Marca do fabricante.' },
  modelo: { ...equipamentoCampos.modelo, description: 'Modelo comercial.' },
  anoFabricacao: { ...equipamentoCampos.anoFabricacao, description: 'Ano de fabricação.' },
  estadoFisico: { ...equipamentoCampos.estadoFisico, description: 'Condição física entre 0 e 6.' },
  pesoQuilogramas: { ...equipamentoCampos.pesoQuilogramas, description: 'Peso em quilogramas.' },
  posicaoNoLote: { ...equipamentoCampos.posicaoNoLote, description: 'Posição única dentro do lote.' },
};
const exemploEquipamento = {
  codigoBarrasInterno: 'NOTEBOOK-000024', tipo: 'NOTEBOOK', marca: 'Dell', modelo: 'Latitude',
  anoFabricacao: 2024, estadoFisico: 1, pesoQuilogramas: 2.5, posicaoNoLote: 1,
};
export const equipamentoPublicoSchema = objeto({
  ...camposEquipamento, id: uuid, loteId: uuid, statusRastreamento: statusRastreamentoSchema,
});
export const lotePublicoSchema = objeto({
  ...camposLote, id: uuid, statusProcessamento: statusLoteSchema,
  equipamentos: { type: 'array', items: equipamentoPublicoSchema }, pesoTotal: { type: 'number' },
});
export const entradaLotePublica = {
  ...objeto({
    notaFiscal: textoDescrito('Número da nota fiscal do lote.'),
    transportadora: textoDescrito('Nome da transportadora.'),
    dataEntrada: { ...camposLote.dataEntrada, description: 'Data de entrada em ISO 8601, com até 90 dias de antecedência.' },
    observacoes: { ...camposLote.observacoes, description: 'Observações sobre o recebimento.' },
    equipamentos: { type: 'array', maxItems: 500, items: objeto(camposEquipamento, Object.keys(camposEquipamento)), description: 'Equipamentos que compõem o lote.' },
  }, ['notaFiscal', 'transportadora']),
  examples: [{ notaFiscal: 'NF-1024', transportadora: 'Logística Verde', equipamentos: [exemploEquipamento] }],
};
const paginaDescrita = {
  page: { ...paginacao.page, description: 'Página solicitada, iniciando em 1.' },
  pageSize: { ...paginacao.pageSize, description: 'Quantidade máxima de itens por página.' },
};
export const filtrosLote = objeto({
  ...paginaDescrita, status: { ...statusLoteSchema, description: 'Status de processamento do lote.' },
  dataInicio: { ...camposLote.dataEntrada, description: 'Data inicial inclusiva.' },
  dataFim: { ...camposLote.dataEntrada, description: 'Data final inclusiva.' },
});
export const filtrosEquipamento = objeto({
  ...paginaDescrita, tipo: { ...tipoSchema, description: 'Tipo do equipamento.' },
  statusRastreamento: { ...statusRastreamentoSchema, description: 'Status atual do equipamento.' },
  loteId: { ...uuid, description: 'Identificador do lote.' },
});
export const paginaLotes = respostaPagina(lotePublicoSchema);
export const paginaEquipamentos = respostaPagina(equipamentoPublicoSchema);

export function schemaPublico(summary: string, description: string, resposta: unknown, extra: Record<string, unknown> = {}, status = 200) {
  const base = schema(['API de parceiros'], resposta, { summary, description, ...extra, security: [{ apiKeyAuth: [] }] }, status);
  return { ...base, response: { ...base.response, 410: erroSchema } };
}
