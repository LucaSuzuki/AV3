# Greencode AV3

API REST de logística reversa de resíduos eletrônicos. Inclui operação, auditoria, análises persistidas e integração de parceiros, com relatórios assíncronos em Redis e BullMQ.

## Stack e requisitos

- Node.js **24 LTS recomendado**; package.json exige >=22 (Prisma 7 requer >=22.12 na linha 22).
- TypeScript, Fastify 5, Prisma 7.10, PostgreSQL 16, Redis 7, BullMQ, simple-statistics, JWT e Jest.
- Docker Desktop com WSL2 no Windows ou Docker Engine com Compose no Ubuntu. O Compose inicia PostgreSQL e Redis.
- Windows 10+ ou Ubuntu 24.04.03+ e derivados. Não há frontend nesta etapa; a API aceita CORS configurável.

## Instalação no Windows

Instale Node LTS pelo instalador oficial e Docker Desktop com backend WSL2. No PowerShell, dentro da **AV3**:

```powershell
Copy-Item .env.example .env
```

No Prompt de Comando o equivalente é `copy .env.example .env`. Edite .env: defina JWT_SECRET com pelo menos 32 caracteres e SEED_ADMIN_PASSWORD com pelo menos 12 caracteres. Depois:

```powershell
docker compose -p greencode-av3 up -d --wait
npm ci
npm run db:deploy
npm run db:seed
npm run build
npm test
```

Para criar uma **nova** migration durante desenvolvimento: `npm run db:migrate -- --name descricao`. As migrations existentes são aplicadas por db:deploy.

## Instalação no Ubuntu

Instale Node LTS pelo método oficial em [nodejs.org](https://nodejs.org/en/download), verificando `node --version` e `npm --version`. Instale Docker Engine e o plugin Compose conforme [Docker para Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Com o daemon ativo e acesso ao socket, dentro da AV3:

```bash
cp .env.example .env
# Edite JWT_SECRET e SEED_ADMIN_PASSWORD antes de continuar.
docker compose -p greencode-av3 up -d --wait
npm ci
npm run db:deploy
npm run db:seed
npm run build
npm test
```

Não copie node_modules/dist entre sistemas: execute npm ci e gere novamente o client Prisma. Scripts npm não dependem de sintaxe PowerShell/bash. `.gitattributes` normaliza fins de linha.

## Executar a API e testar a jornada

Na pasta do projeto, abra três terminais:

| Terminal | Comando | Função |
|---|---|---|
| 1 | `npm start` | Inicia a API na porta configurada no .env, 3000 por padrão |
| 2 | `npm run worker` | Processa análises e relatórios com BullMQ |
| 3 | `npm run test:jornada` | Executa as 39 requisições de requests.http, do login ao download do CSV |

A jornada requer o seed de desenvolvimento e cria dados no banco principal local. Para trabalhar com recarga automática, use `npm run dev` e `npm run dev:worker`. Verifique o [PostgreSQL](http://localhost:3000/health) e a [fila Redis](http://localhost:3000/health/fila) antes da jornada.

## PostgreSQL nativo (alternativa)

Windows: instale PostgreSQL 16+ pelo [instalador oficial indicado pelo projeto](https://www.postgresql.org/download/windows/), com psql e servidor local.

Ubuntu 24.04:

```bash
sudo apt update
sudo apt install postgresql-16 postgresql-client-16
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

No Windows abra SQL Shell (psql) como postgres; no Ubuntu use a sessão acima. Execute:

```sql
CREATE USER greencode WITH PASSWORD 'defina-senha-local';
CREATE DATABASE greencode OWNER greencode;
CREATE DATABASE greencode_test OWNER greencode;
```

Ajuste DATABASE_URL e DATABASE_URL_TEST no .env para a senha escolhida. Com PostgreSQL nativo, configure também o Redis em REDIS_URL ou selecione QUEUE_MODE=inline no .env. Siga com npm ci, db:deploy, db:seed e build. `prisma migrate dev` precisa de shadow database: para um usuário local de desenvolvimento, conceda `ALTER ROLE greencode CREATEDB;`, ou configure um shadow database separado. Produção usa db:deploy, sem esse privilégio.

## Configuração

| Variável | Uso / padrão do exemplo |
|---|---|
| NODE_ENV | development; production não cria usuários de demonstração |
| PORT / HOST | 3000 / 0.0.0.0 |
| DATABASE_URL | Banco principal PostgreSQL |
| DATABASE_URL_TEST | Banco diferente, nome terminado em `_test` |
| JWT_SECRET | Obrigatório, >=32 caracteres |
| JWT_EXPIRES_IN | 30m, preserva R6 |
| CORS_ORIGIN | http://localhost:5173; múltiplas origens separadas por vírgula |
| SEED_ADMIN_USER | admin |
| SEED_ADMIN_PASSWORD | Obrigatória no seed, >=12 caracteres e <=72 bytes |
| BCRYPT_COST | 12; intervalo 10..16 |
| LOG_LEVEL | info |
| SHUTDOWN_TIMEOUT_MS | 10000 |

No Compose, POSTGRES_PORT opcional muda a porta publicada (padrão 5432); ajuste as URLs para a mesma porta. O volume nomeado persiste os dados. O script docker/init-test-db.sql cria o banco de testes no **primeiro** uso do volume. Em volume anterior que ainda não o possua: `docker compose -p greencode-av3 exec postgres createdb -U greencode greencode_test`.

.env não é versionado. Não use os segredos do exemplo em produção. Não há administrador criado automaticamente ao subir o servidor; execute seed explicitamente.

## Scripts

| Comando | Função |
|---|---|
| npm run dev | tsx watch src/server.ts |
| npm run build | Gera Prisma e compila somente src para dist/src |
| npm start | Inicia a API compilada |
| npm run worker | Inicia o worker compilado |
| npm run dev:worker | Inicia o worker com recarga automática |
| npm run analises:executar -- --tipo=todas | Executa as três análises diretamente no PostgreSQL |
| npm test | Testes unitários e de integração com PostgreSQL e Redis |
| npm run db:generate | Gera client Prisma |
| npm run db:migrate | Cria/aplica migrations de desenvolvimento |
| npm run db:deploy | Aplica migrations versionadas |
| npm run db:seed | Massa de dados idempotente |
| npm run db:reset | **Apaga o banco configurado** e reaplica migrations; uso local explícito |
| npm run db:studio | Interface Prisma Studio |
| npm run docs:openapi | Exporta docs/openapi.json e docs/openapi-public.json |
| npm run test:jornada | Executa a jornada de requests.http contra servidor ativo |

## Usuários e massa do seed

Administrador: SEED_ADMIN_USER/SEED_ADMIN_PASSWORD do .env. Apenas fora de produção:

| Usuário | Senha de demonstração | Papel |
|---|---|---|
| operador | Operador-AV2-2026! | OPERADOR_CADASTRO |
| almoxarife | Almoxarife-AV2-2026! | GESTOR_ALMOXARIFADO |
| auditor | Auditor-AV2-2026! | AUDITORIA |
| almoxarife2 | Almoxarife2-AV3-2026! | GESTOR_ALMOXARIFADO |

Seed usa upsert e não sobrescreve senha/dados de registros existentes. Troque a senha pela API; alterar a variável não altera uma conta previamente criada.

Inclui quatro organizações com CNPJs válidos (uma inativa), contratos vigente/vencido e organização sem contrato, cinco status de lote, oito tipos de equipamento, estados físicos 0..6 e históricos de triagem/destinação. A massa analítica de desenvolvimento acrescenta 12 lotes distribuídos ao longo do último ano e 60 equipamentos. Dados inválidos são cenários de testes, não seed.

## Uso e fluxo

Servidor: [http://localhost:3000/health](http://localhost:3000/health). Swagger: [http://localhost:3000/docs](http://localhost:3000/docs). Configure a porta no .env.

```http
POST http://localhost:3000/api/v1/internal/auth/login
Content-Type: application/json

{"usuario":"admin","senha":"sua-senha-do-env"}
```

Copie token da resposta e envie `Authorization: Bearer <token>`. O fluxo completo está em **requests.http**, com variáveis compatíveis com a extensão REST Client. Para executar automaticamente as requisições marcadas `@name`, deixe o servidor e o worker ativos e rode `npm run test:jornada`; a jornada cria/atualiza dados demonstrativos no banco principal e usa SEED_ADMIN_USER/PASSWORD do .env. Ela pode ser repetida e reutiliza sua organização pelo CNPJ.

1. Login e cadastro de organização.
2. Criar contrato opcional e lote com equipamentos numa transação.
3. Iniciar/concluir triagem (administrador ou gestor).
4. Avançar equipamento até desmonte, destinação e baixa.
5. Encaminhar/finalizar lote e consultar rastreio, relatórios e journal.

Alterações exigem versao atual no body; até DELETE de usuário é lógico e versionado. Conflito de versão/concorrência devolve 409; recarregue. JWT dura 30 minutos, com renovação autenticada. Logout exige descarte no cliente; veja as limitações em docs/seguranca.md.

## Testes e banco isolado

`npm test` migra automaticamente DATABASE_URL_TEST antes das suítes. Os testes usam app.inject e PostgreSQL real, fazem TRUNCATE **somente no banco de testes**, recusam banco principal/nome sem `_test` e desconectam clientes ao terminar. Não apontar essa URL para dados úteis.

Cobrem validadores, entidades/cálculos, auth/RBAC, contratos/lotes/equipamentos, journal, rollback, concorrência, seed idempotente, health/shutdown do app e cada CHECK/trigger via SQL cru. Para rodar só unitários sem banco: `npx jest --runInBand --config jest.unit.config.js`.

## Estrutura

```text
prisma/                 schema, seed, migrations SQL
src/app.ts              montagem da API Fastify
src/container.ts        composição dos serviços
src/worker.ts           processamento assíncrono
src/server.ts           HTTP, sinais e graceful shutdown
src/config/             ambiente
src/plugins/            Prisma, JWT, Swagger e erros
src/domain/             entidades, enums, validadores, transições
src/modules/            auth, usuarios, organizacoes, lotes,
                        equipamentos, auditoria, análises, parceiros,
                        API pública, fila e relatórios
src/shared/             erros, schemas, paginação, unidade de trabalho
tests/unit/             regras sem banco
tests/integration/      API e integridade SQL
tests/setup/            migração e fixtures isoladas
docs/                   ADRs, segurança, API e OpenAPI
docker/                 criação inicial do banco de testes
requests.http           jornada e exemplos negativos
```

Retenção do journal é indefinida (mínimo 180 dias), sem rotação por tamanho. Movimentações são imutáveis. A CLI, dados cifrados e sessões em memória da AV1 foram removidos da AV2; a AV1 original permanece preservada.

## Documentação

- [Decisões arquiteturais](docs/arquitetura.md)
- [Segurança](docs/seguranca.md)
- [API](docs/api.md)
- [OpenAPI interno e administrativo](docs/openapi.json)
- [OpenAPI de parceiros](docs/openapi-public.json)
- [Relatório técnico da AV3](docs/relatorio-tecnico-av3.md)
- [Diagrama de classes em PlantUML](docs/diagrama-classes.puml)
- [Resultados e reprodução da verificação Windows/Ubuntu](docs/verificacao.md)

## API da AV3

| Prefixo | Acesso | Recursos |
| --- | --- | --- |
| /api/v1/internal | JWT e papel | Operação, auditoria, análises e relatórios internos |
| /api/v1/admin | JWT de administrador ativo | Parceiros e chaves de API |
| /api/v1/public | Header X-API-Key | Rastreabilidade, lotes e relatórios de parceiros |

A documentação interna está em http://localhost:3000/docs e a pública em http://localhost:3000/docs/public. O guia de integração está em [docs/api.md](docs/api.md). A migração e os motivos técnicos estão em [docs/relatorio-tecnico-av3.md](docs/relatorio-tecnico-av3.md).

### Redis e processamento assíncrono

A configuração padrão usa `QUEUE_MODE=bullmq` com `REDIS_URL=redis://localhost:6379`. Testes BullMQ usam `REDIS_URL_TEST=redis://localhost:6379/1`. Em desenvolvimento, `WORKER_EMBEDDED=true` inicia o worker no processo da API. `QUEUE_MODE=inline` permite rodar sem Redis e sem agendamento. Nesse modo, análises recorrentes podem ser disparadas pelo script manual e um agendador do sistema.

| Variáveis | Função |
| --- | --- |
| WORKER_CONCURRENCY, WORKER_EMBEDDED | Paralelismo e worker integrado em desenvolvimento |
| ANALISE_CRON, ANALISE_TZ | Agenda diária e fuso horário |
| ANALISE_JANELA_DIAS, ANALISE_MIN_AMOSTRA, ANALISE_RETENCAO_DIAS | Período padrão, amostra mínima e retenção |
| RELATORIO_TTL_HORAS, RELATORIO_MAX_BYTES | Validade e tamanho máximo de arquivo |
| JOB_MAX_TENTATIVAS, JOB_BACKOFF_MS | Máximo de tentativas e atraso inicial |
| API_KEY_ROTACAO_GRACE_HORAS, IDEMPOTENCIA_TTL_HORAS, PUBLIC_RATE_LIMIT_PADRAO | Período de rotação, validade da idempotência e cota padrão |

## Licença

ISC

[Gerson](https://youtu.be/u3H8O8RJp3M?si=QgdfEQUHSrQe6u9x)
