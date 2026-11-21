-- CreateEnum
CREATE TYPE "TipoAnalise" AS ENUM ('EFICIENCIA', 'RENTABILIDADE', 'VIDA_UTIL');

-- CreateEnum
CREATE TYPE "OrigemExecucao" AS ENUM ('AGENDADA', 'MANUAL', 'API_PUBLICA');

-- CreateEnum
CREATE TYPE "StatusExecucao" AS ENUM ('PENDENTE', 'EM_PROCESSAMENTO', 'CONCLUIDA', 'FALHOU');

-- CreateEnum
CREATE TYPE "DimensaoEficiencia" AS ENUM ('GERAL', 'OPERADOR', 'MES_ANO', 'MES_DO_ANO');

-- CreateEnum
CREATE TYPE "NivelRentabilidade" AS ENUM ('TIPO', 'TIPO_ESTADO', 'TIPO_MARCA', 'TIPO_MARCA_MODELO');

-- CreateEnum
CREATE TYPE "FonteValor" AS ENUM ('REALIZADO', 'PARAMETRICO', 'MISTO');

-- CreateEnum
CREATE TYPE "ConfiancaModelo" AS ENUM ('ALTA', 'MEDIA', 'BAIXA', 'INSUFICIENTE');

-- CreateEnum
CREATE TYPE "FormatoRelatorio" AS ENUM ('CSV', 'JSON');

-- CreateEnum
CREATE TYPE "EscopoApi" AS ENUM ('RASTREABILIDADE_LER', 'LOTES_LER', 'LOTES_ESCREVER', 'RELATORIOS_GERAR');

-- AlterTable
ALTER TABLE "equipamentos" ADD COLUMN     "valorRecuperadoEm" TIMESTAMP(3),
ADD COLUMN     "valorRecuperadoReal" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "transicoes_lote" (
    "id" UUID NOT NULL,
    "loteId" UUID NOT NULL,
    "statusAnterior" "StatusLote",
    "statusNovo" "StatusLote" NOT NULL,
    "usuario" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "transicoes_lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_recuperacao" (
    "id" UUID NOT NULL,
    "tipo" "TipoEquipamento" NOT NULL,
    "valorBaseKg" DECIMAL(12,4) NOT NULL,
    "fatoresEstado" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "parametros_recuperacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucoes_analise" (
    "id" UUID NOT NULL,
    "tipo" "TipoAnalise" NOT NULL,
    "organizacaoId" UUID,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "origem" "OrigemExecucao" NOT NULL,
    "status" "StatusExecucao" NOT NULL DEFAULT 'PENDENTE',
    "solicitadoPor" TEXT NOT NULL,
    "jobId" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "versaoModelo" TEXT NOT NULL,
    "resumo" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "duracaoMs" INTEGER,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "execucoes_analise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metricas_eficiencia" (
    "id" UUID NOT NULL,
    "execucaoId" UUID NOT NULL,
    "dimensao" "DimensaoEficiencia" NOT NULL,
    "chave" TEXT NOT NULL,
    "amostra" INTEGER NOT NULL,
    "tempoMedioHoras" DECIMAL(12,3) NOT NULL,
    "medianaHoras" DECIMAL(12,3) NOT NULL,
    "desvioPadraoHoras" DECIMAL(12,3) NOT NULL,
    "p90Horas" DECIMAL(12,3) NOT NULL,
    "esperaMediaHoras" DECIMAL(12,3) NOT NULL,
    "triagemMediaHoras" DECIMAL(12,3) NOT NULL,
    "indiceSazonal" DECIMAL(8,4),
    "gargalo" BOOLEAN NOT NULL DEFAULT false,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "metricas_eficiencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metricas_rentabilidade" (
    "id" UUID NOT NULL,
    "execucaoId" UUID NOT NULL,
    "nivel" "NivelRentabilidade" NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" "TipoEquipamento" NOT NULL,
    "estadoFisico" INTEGER,
    "marca" TEXT,
    "modelo" TEXT,
    "amostra" INTEGER NOT NULL,
    "amostraRealizada" INTEGER NOT NULL,
    "pesoTotalKg" DECIMAL(14,3) NOT NULL,
    "valorMedioUnidade" DECIMAL(12,2) NOT NULL,
    "valorMedioPorKg" DECIMAL(12,4) NOT NULL,
    "valorTotalEstimado" DECIMAL(14,2) NOT NULL,
    "fonte" "FonteValor" NOT NULL,
    "ranking" INTEGER,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "metricas_rentabilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_vida_util" (
    "id" UUID NOT NULL,
    "execucaoId" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" "TipoEquipamento",
    "origemModelo" TEXT NOT NULL,
    "amostra" INTEGER NOT NULL,
    "intercepto" DECIMAL(14,6) NOT NULL,
    "inclinacao" DECIMAL(14,6) NOT NULL,
    "r2" DECIMAL(8,6) NOT NULL,
    "erroPadraoResidual" DECIMAL(14,6) NOT NULL,
    "taxaDanificados" DECIMAL(8,4) NOT NULL,
    "idadeInservivelAnos" DECIMAL(8,2),
    "confianca" "ConfiancaModelo" NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "modelos_vida_util_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "previsoes_vida_util" (
    "id" UUID NOT NULL,
    "execucaoId" UUID NOT NULL,
    "modeloId" UUID NOT NULL,
    "equipamentoId" UUID NOT NULL,
    "idadeAtualAnos" INTEGER NOT NULL,
    "estadoFisicoAtual" INTEGER NOT NULL,
    "vidaRemanescenteAnos" DECIMAL(8,2) NOT NULL,
    "dataPrevistaInservivel" TIMESTAMP(3) NOT NULL,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "realizadoEm" TIMESTAMP(3),
    "erroDias" INTEGER,
    "avaliadaEm" TIMESTAMP(3),
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "previsoes_vida_util_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parceiros" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "organizacaoId" UUID NOT NULL,
    "contatoEmail" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "parceiros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chaves_api" (
    "id" UUID NOT NULL,
    "parceiroId" UUID NOT NULL,
    "prefixo" VARCHAR(16) NOT NULL,
    "hashChave" CHAR(64) NOT NULL,
    "descricao" TEXT NOT NULL,
    "escopos" "EscopoApi"[],
    "limiteReqMin" INTEGER NOT NULL DEFAULT 60,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3),
    "revogadaEm" TIMESTAMP(3),
    "ultimoUsoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "chaves_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chaves_idempotencia" (
    "id" UUID NOT NULL,
    "parceiroId" UUID NOT NULL,
    "chave" VARCHAR(64) NOT NULL,
    "hashCorpo" CHAR(64) NOT NULL,
    "statusResposta" INTEGER NOT NULL DEFAULT 0,
    "corpoResposta" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chaves_idempotencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas_relatorio" (
    "id" UUID NOT NULL,
    "tipo" "TipoAnalise" NOT NULL,
    "formato" "FormatoRelatorio" NOT NULL,
    "parceiroId" UUID,
    "organizacaoId" UUID,
    "solicitadoPor" TEXT NOT NULL,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "status" "StatusExecucao" NOT NULL DEFAULT 'PENDENTE',
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "execucaoId" UUID,
    "nomeArquivo" TEXT,
    "tipoConteudo" TEXT,
    "tamanhoBytes" INTEGER,
    "conteudo" BYTEA,
    "jobId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tarefas_relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transicoes_lote_loteId_dataHora_idx" ON "transicoes_lote"("loteId", "dataHora");

-- CreateIndex
CREATE INDEX "transicoes_lote_statusNovo_dataHora_idx" ON "transicoes_lote"("statusNovo", "dataHora");

-- CreateIndex
CREATE UNIQUE INDEX "parametros_recuperacao_tipo_key" ON "parametros_recuperacao"("tipo");

-- CreateIndex
CREATE INDEX "execucoes_analise_tipo_organizacaoId_concluidaEm_idx" ON "execucoes_analise"("tipo", "organizacaoId", "concluidaEm");

-- CreateIndex
CREATE INDEX "execucoes_analise_status_idx" ON "execucoes_analise"("status");

-- CreateIndex
CREATE UNIQUE INDEX "metricas_eficiencia_execucaoId_dimensao_chave_key" ON "metricas_eficiencia"("execucaoId", "dimensao", "chave");

-- CreateIndex
CREATE INDEX "metricas_rentabilidade_execucaoId_nivel_tipo_idx" ON "metricas_rentabilidade"("execucaoId", "nivel", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "metricas_rentabilidade_execucaoId_nivel_chave_key" ON "metricas_rentabilidade"("execucaoId", "nivel", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "modelos_vida_util_execucaoId_chave_key" ON "modelos_vida_util"("execucaoId", "chave");

-- CreateIndex
CREATE INDEX "previsoes_vida_util_equipamentoId_idx" ON "previsoes_vida_util"("equipamentoId");

-- CreateIndex
CREATE INDEX "previsoes_vida_util_avaliadaEm_idx" ON "previsoes_vida_util"("avaliadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "previsoes_vida_util_execucaoId_equipamentoId_key" ON "previsoes_vida_util"("execucaoId", "equipamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "parceiros_nome_key" ON "parceiros"("nome");

-- CreateIndex
CREATE INDEX "parceiros_organizacaoId_idx" ON "parceiros"("organizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "chaves_api_prefixo_key" ON "chaves_api"("prefixo");

-- CreateIndex
CREATE INDEX "chaves_api_parceiroId_idx" ON "chaves_api"("parceiroId");

-- CreateIndex
CREATE INDEX "chaves_idempotencia_expiraEm_idx" ON "chaves_idempotencia"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "chaves_idempotencia_parceiroId_chave_key" ON "chaves_idempotencia"("parceiroId", "chave");

-- CreateIndex
CREATE INDEX "tarefas_relatorio_parceiroId_status_idx" ON "tarefas_relatorio"("parceiroId", "status");

-- CreateIndex
CREATE INDEX "tarefas_relatorio_status_criadoEm_idx" ON "tarefas_relatorio"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "tarefas_relatorio_expiraEm_idx" ON "tarefas_relatorio"("expiraEm");

-- AddForeignKey
ALTER TABLE "transicoes_lote" ADD CONSTRAINT "transicoes_lote_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucoes_analise" ADD CONSTRAINT "execucoes_analise_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metricas_eficiencia" ADD CONSTRAINT "metricas_eficiencia_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "execucoes_analise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metricas_rentabilidade" ADD CONSTRAINT "metricas_rentabilidade_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "execucoes_analise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelos_vida_util" ADD CONSTRAINT "modelos_vida_util_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "execucoes_analise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previsoes_vida_util" ADD CONSTRAINT "previsoes_vida_util_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "execucoes_analise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previsoes_vida_util" ADD CONSTRAINT "previsoes_vida_util_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "modelos_vida_util"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previsoes_vida_util" ADD CONSTRAINT "previsoes_vida_util_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "equipamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parceiros" ADD CONSTRAINT "parceiros_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chaves_api" ADD CONSTRAINT "chaves_api_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "parceiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chaves_idempotencia" ADD CONSTRAINT "chaves_idempotencia_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "parceiros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas_relatorio" ADD CONSTRAINT "tarefas_relatorio_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "parceiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas_relatorio" ADD CONSTRAINT "tarefas_relatorio_execucaoId_fkey" FOREIGN KEY ("execucaoId") REFERENCES "execucoes_analise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE equipamentos ADD CONSTRAINT ck_valor_recuperado CHECK ("valorRecuperadoReal" IS NULL OR "valorRecuperadoReal" >= 0);
ALTER TABLE parametros_recuperacao ADD CONSTRAINT ck_param_valor CHECK ("valorBaseKg" >= 0);
ALTER TABLE parametros_recuperacao ADD CONSTRAINT ck_param_fatores CHECK (jsonb_typeof("fatoresEstado") = 'array' AND jsonb_array_length("fatoresEstado") = 7);
ALTER TABLE chaves_api ADD CONSTRAINT ck_chave_limite CHECK ("limiteReqMin" BETWEEN 1 AND 10000);
ALTER TABLE chaves_api ADD CONSTRAINT ck_chave_escopos CHECK (cardinality(escopos) >= 1);
ALTER TABLE chaves_api ADD CONSTRAINT ck_chave_hash CHECK ("hashChave" ~ '^[0-9a-f]{64}$');
ALTER TABLE tarefas_relatorio ADD CONSTRAINT ck_tarefa_progresso CHECK (progresso BETWEEN 0 AND 100);
ALTER TABLE execucoes_analise ADD CONSTRAINT ck_exec_tentativas CHECK (tentativas >= 0);
ALTER TABLE previsoes_vida_util ADD CONSTRAINT ck_prev_estado CHECK ("estadoFisicoAtual" BETWEEN 0 AND 6);
ALTER TABLE previsoes_vida_util ADD CONSTRAINT ck_prev_vida CHECK ("vidaRemanescenteAnos" >= 0);
ALTER TABLE metricas_eficiencia ADD CONSTRAINT ck_met_ef_amostra CHECK (amostra >= 0);
ALTER TABLE metricas_rentabilidade ADD CONSTRAINT ck_met_rent_amostra CHECK (amostra >= 0 AND "amostraRealizada" BETWEEN 0 AND amostra);
-- transicoes_lote imutavel (mesmo padrao de bloquear_alteracao_movimentacao):
CREATE FUNCTION bloquear_alteracao_transicao_lote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Transicao de lote e imutavel' USING ERRCODE = '23514'; END; $$;
CREATE TRIGGER trg_transicao_imutavel BEFORE UPDATE OR DELETE ON transicoes_lote
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_transicao_lote();
-- Backfill (best effort) a partir dos dados ja existentes, para bancos AV2 com historico:
INSERT INTO transicoes_lote (id, "loteId", "statusAnterior", "statusNovo", usuario, "dataHora", versao)
  SELECT gen_random_uuid(), l.id, NULL, 'RECEBIDO', 'migracao', l."dataEntrada", 1 FROM lotes l;
INSERT INTO transicoes_lote (id, "loteId", "statusAnterior", "statusNovo", usuario, "dataHora", versao)
  SELECT gen_random_uuid(), l.id,
         (j."dadosAntes"->>'statusProcessamento')::"StatusLote",
         (j."dadosDepois"->>'statusProcessamento')::"StatusLote",
         j."usuarioResponsavel", j."timestamp", 1
  FROM journal_transacoes j
    JOIN lotes l ON l.id::text = j."entidadeId"
  WHERE j.entidade = 'Lote' AND j.operacao = 'UPDATE_STATUS' AND j."entidadeId" IS NOT NULL
    AND j."dadosAntes" ? 'statusProcessamento' AND j."dadosDepois" ? 'statusProcessamento';
