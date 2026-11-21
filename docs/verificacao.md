# Verificação da AV3

A AV3 foi validada com Node.js 24.13.0, Prisma 7.10.1, PostgreSQL 16 e Redis 7 pelo Docker Compose. A suíte executada no Windows aprovou 114 testes em nove suítes, incluindo o worker BullMQ com Redis de teste. O build TypeScript e a checagem de tipos completa passaram.

A migração analytics_publica foi aplicada ao PostgreSQL local. O seed foi executado novamente para verificar a repetição. A execução manual das três análises gravou seus resultados e o histórico. Nesse banco demonstrativo, o resultado observado incluiu 16 triagens, 70 equipamentos e 59 previsões. As quantidades podem aumentar após novas execuções da jornada.

O fluxo HTTP real aprovou 39 requisições de requests.http com a API e o worker separados. Ele passou por login, criação do parceiro e da chave, cadastro de lote público, triagem e destinação pelo gestor, rastreio, solicitação, polling, download CSV, histórico e acurácia. As duas interfaces Swagger, os dois contratos JSON e os endpoints /health e /health/fila retornaram 200. A saúde indicou banco e Redis disponíveis.

## Reprodução

```text
docker compose -p greencode-av3 up -d --wait
npm ci
npm run db:deploy
npm run db:seed
npm run build
npm test
npm run docs:openapi
```

Rode `npm start` e `npm run worker` em terminais separados. Em um terceiro, use `npm run test:jornada`. Os exemplos criam dados demonstrativos no banco de desenvolvimento. A suíte Jest usa apenas o PostgreSQL com sufixo _test e, para BullMQ, a base 1 do Redis indicada em REDIS_URL_TEST.

## Verificação em Ubuntu

O Dockerfile de verificação usa Ubuntu 24.04 amd64 e instala o Node.js com conferência SHA-256. A instalação limpa das dependências, o build e os 114 testes em nove suítes foram aprovados nessa imagem. O teste de integração pode ser reproduzido com o seguinte comando, enquanto o Compose estiver ativo e sem outra execução de testes usando os mesmos bancos.

```text
docker build -f docker/Dockerfile.verificacao -t greencode-av3-verificacao .
docker run --rm --network greencode-av3_default -e DATABASE_URL=postgresql://greencode:greencode@postgres:5432/greencode -e DATABASE_URL_TEST=postgresql://greencode:greencode@postgres:5432/greencode_test -e REDIS_URL_TEST=redis://redis:6379/1 -e JWT_SECRET=segredo-de-verificacao-local-com-mais-de-32-caracteres greencode-av3-verificacao
```

A prova em Ubuntu usa um contêiner. Instalações nativas de Windows 10 e outras distribuições derivadas do Ubuntu não foram executadas individualmente.
