# API Greencode AV2

Base: `http://localhost:3000/api/v1/internal`. JSON, datas ISO 8601 com horário/fuso, IDs UUID. Header privado: `Authorization: Bearer <token>`.

Swagger em [localhost:3000/docs](http://localhost:3000/docs). Contrato completo: [openapi.json](openapi.json), gerado por `npm run docs:openapi`; disponível também em `/docs/json`. JSON Schema nativo valida body, params e query. Exemplos em `requests.http`.

| Grupo | Operações |
|---|---|
| Auth | POST login/renovar/logout, PATCH senha |
| Usuários | POST/GET /usuarios, GET/PATCH/DELETE /usuarios/:id |
| Organizações | POST/GET /organizacoes, GET/PATCH /:id, POST /:id/desativar |
| Contratos | PUT/GET /organizacoes/:id/contrato, POST /:id/contrato/renovar |
| Lotes | POST/GET /lotes, GET/PATCH /:id, POST /:id/triagem/iniciar e concluir, PATCH /:id/status |
| Equipamentos | POST /lotes/:loteId/equipamentos, GET /equipamentos e /:id e /:id/rastreio, PATCH /:id/estado-fisico e /:id/status-rastreamento |
| Relatórios | GET /relatorios/por-organizacao/:organizacaoId, por-status, financeiro, resumo |
| Auditoria | GET /auditoria/journal |
| Infra | GET /health (503 se db down), /docs; públicos e fora de /api/v1 |

Listagens: page>=1, pageSize 1..100 (padrão 20), resposta `{items,page,pageSize,total}`. Lotes filtram dataInicio/dataFim; relatórios exigem inicio/fim (exceto por-status). Intervalos incluem extremos; período invertido retorna 422. Financeiro retorna `{valorFinanceiro}`: soma mensal dos contratos assinados no período, inclusive vencidos.

Alterações exigem versao corrente. PATCH, triagem, desativação, renovação e **DELETE de usuário** recebem `{versao:N}` no body. PUT contrato exige versao ao substituir existente; criação dispensa. Sucesso incrementa versão; conflito 409 exige recarregar. Exclusão de usuário é lógica (ativo=false).

POST lote aceita equipamentos[] numa única transação com movimentações e journal. Lote novo começa RECEBIDO; equipamento, AGUARDANDO_TRIAGEM. Cadastro de equipamento só em RECEBIDO/EM_TRIAGEM. Triagem exige pelo menos um equipamento. Desmonte exige TRIAGEM_CONCLUIDA e deve terminar antes de encaminhar o lote. Enums sem acentos; estadoFisico inteiro 0..6.

Formato de erro:

```json
{"statusCode":422,"error":"REGRA_NEGOCIO","message":"Descrição da regra","details":[]}
```

400 schema; 401 autenticação; 403 papel; 404 inexistente; 409 unicidade/versão/concorrência; 413 corpo; 422 regra/integridade; 429 limite; 500 mensagem genérica com requestId.

Logout descarta token no cliente; JWT emitido continua válido até expirar. Consulte seguranca.md.

## Guia de integração de parceiros

Um administrador cria o parceiro vinculado à organização em `POST /api/v1/admin/parceiros` e gera uma credencial em `POST /api/v1/admin/parceiros/{id}/chaves`. Guarde o valor da chave em um gerenciador de segredos. Envie-o no header `X-API-Key` em cada chamada para `/api/v1/public`. `GET /me` retorna a organização vinculada, os escopos e a cota da chave.

| Escopo | Operações |
| --- | --- |
| RASTREABILIDADE_LER | GET /equipamentos e GET /equipamentos/{codigoBarras}/rastreio |
| LOTES_LER | GET /lotes e GET /lotes/{id} |
| LOTES_ESCREVER | POST /lotes |
| RELATORIOS_GERAR | POST /relatorios, GET /relatorios/{tarefaId} e GET /relatorios/{tarefaId}/download |

O limite padrão é de 60 requisições por minuto por chave. Leia `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset` para acompanhar o consumo. Após um HTTP 429, aguarde o intervalo informado em `Retry-After`. `X-Request-Id` identifica a chamada para suporte.

Use `Idempotency-Key` com 1 a 64 caracteres alfanuméricos, hífen ou sublinhado em `POST /lotes`. Reenvie o mesmo corpo e a mesma chave em caso de dúvida sobre o resultado. A resposta reaproveitada tem `Idempotent-Replay: true`. Um corpo diferente com a mesma chave gera 409. O mesmo vale enquanto a tentativa inicial estiver em andamento.

Para solicitar um relatório, envie `{"tipo":"EFICIENCIA","formato":"CSV"}` ou selecione RENTABILIDADE ou VIDA_UTIL e formato JSON. O HTTP 202 devolve `tarefaId` e `statusUrl`. Consulte essa URL até a tarefa ficar CONCLUIDA ou FALHOU. Em CONCLUIDA, use `downloadUrl`. O download retorna 409 antes da conclusão e 410 após a expiração. O limite simultâneo por parceiro é de cinco tarefas pendentes ou em processamento.

| HTTP | Motivo |
| --- | --- |
| 400 | Validação da entrada |
| 401 | Chave inválida |
| 403 | Escopo insuficiente |
| 404 | Recurso indisponível para a organização |
| 409 | Conflito de estado ou idempotência |
| 410 | Relatório expirado |
| 422 | Regra de negócio |
| 429 | Cota de requisições ou tarefas |
| 500 | Falha interna |

### Versionamento da API pública

A primeira versão publicada é 1.0.0, em `/api/v1/public`. Correções e mudanças compatíveis preservam o caminho e atualizam `X-API-Version`. Uma alteração incompatível requer um caminho major novo. A versão anterior fica disponível em paralelo por pelo menos seis meses a partir do aviso de descontinuação. As respostas dessa versão passam a incluir `Deprecation`, `Sunset` e, quando aplicável, `Link` para a versão sucessora.

Veja os parâmetros, formatos e exemplos na documentação interativa em `/docs/public`. O contrato exportado está em [openapi-public.json](openapi-public.json).
