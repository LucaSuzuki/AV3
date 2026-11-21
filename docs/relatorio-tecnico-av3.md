# Relatório técnico da AV3

A AV3 evolui o Greencode, uma API de logística reversa de equipamentos eletrônicos. A operação interna mantém JWT e controle por papel. Parceiros usam chaves com escopos restritos à organização à qual pertencem. A geração de relatórios é executada em segundo plano, com acompanhamento e download por HTTP.

## Análise e persistência

A biblioteca simple-statistics implementa média, mediana, desvio padrão amostral, quantis e regressão por mínimos quadrados ordinários. Integra-se ao TypeScript, tem uma API pequena e cobre os cálculos sem dependências adicionais. O mathjs oferece operações mais amplas do que o projeto precisa. [Simple Statistics no npm](https://www.npmjs.com/package/simple-statistics)

Cada execução tem um cabeçalho em `execucoes_analise`, com escopo, período, origem, versão do modelo, situação, tempos e resumo. Métricas e previsões ficam em tabelas próprias, indexadas pela execução e com restrições de unicidade por dimensão ou equipamento. O cabeçalho permite consultar o histórico mesmo após a limpeza de detalhes. Por padrão, detalhes permanecem por 90 dias e cabeçalhos por 730 dias. O crescimento depende do número de execuções e, principalmente, dos equipamentos que recebem previsões.

- **Eficiência operacional.** O histórico imutável `transicoes_lote` liga data de entrada, início da triagem e conclusão. Tempo de espera e tempo de triagem são medidos em horas. Os resultados incluem média, mediana, p90 e desvio padrão. As agregações incluem operador, mês e ano, e mês do ano para a sazonalidade. O índice sazonal é a média do mês dividida pela média geral. Um grupo com amostra suficiente é sinalizado quando supera a média global em mais de um desvio padrão. Relatórios de parceiros omitem os operadores.
- **Rentabilidade.** O valor monetário realizado tem prioridade. Para estimar o valor por quilograma, a análise usa a média de pelo menos três observações realizadas no grupo mais específico disponível, de tipo, marca, modelo e estado até tipo e estado. O último recurso é o valor base do tipo multiplicado pelo fator do estado físico. As agregações registram quantidade, massa, valores médios, total e a proporção de dados realizados.
- **Vida útil.** A regressão ajusta o estado físico observado em função da idade na entrada. Com inclinação positiva, a idade prevista para o estado inservível é `(6 - intercepto) / inclinação`. A vida remanescente usa o estado físico atual, com teto de 50 anos. Tipos com amostra insuficiente podem usar o agregado geral, com confiança limitada. A taxa de danificados é a proporção com estado físico 5 ou 6.

A regressão trabalha com observações transversais e pressupõe uma variação linear. Ela não fornece intervalos de confiança nem modela o histórico individual de desgaste. Suavização exponencial pressuporia uma série temporal regular. Com mais dados, regressão com marca e modelo e análise de sobrevivência são alternativas a avaliar. A rotina de avaliação cruza previsões com movimentações de estado físico para 6. O erro em dias é a realização menos a previsão. A acurácia apresenta erro absoluto médio, viés e previsões pendentes.

## Fila e política de retry

BullMQ usa Redis para agendamento, transporte e coordenação do worker. PostgreSQL registra o estado definitivo dos trabalhos e guarda seus arquivos. O job tem até cinco tentativas por padrão, com espera exponencial de 2, 4, 8 e 16 segundos antes das novas tentativas. BullMQ aplica jitter para dispersar tentativas concorrentes. Erros de validação e relatórios que excedem o limite encerram o job. Falhas transitórias retornam à fila. As mensagens persistidas são limitadas e omitem pilhas e credenciais.

A escrita dos resultados é atômica por execução. Os IDs de tarefas permitem reconciliar registros pendentes com a fila após interrupções. Falhas permanecem disponíveis para inspeção em Redis por até sete dias. A versão inline atende testes e demonstrações locais. Os agendadores BullMQ têm IDs fixos para que várias instâncias do worker compartilhem a programação.

A escolha evita agendamentos duplicados por processo com node-cron e mantém os jobs fora das transações operacionais. Uma fila PostgreSQL como pg-boss reduziria componentes de infraestrutura, com custo adicional de processamento e monitoramento no mesmo banco. Arquivos de até 20 MiB permanecem em PostgreSQL, com prazo padrão de sete dias, o que dispensa acesso a um sistema de arquivos compartilhado.

## Integração de parceiros

As chaves separam prefixo público e segredo aleatório de 256 bits. O serviço guarda apenas o SHA-256 do segredo e compara os hashes em tempo constante. O custo de bcrypt permanece apropriado para senhas humanas. A chave completa aparece na criação e na rotação, com `Cache-Control: no-store`. Expiração, revogação, organização ativa e escopos são verificados a cada autenticação. Os contadores por chave são compartilhados pelo Redis. A idempotência impede a duplicação de lotes em reenvios do mesmo pedido.

Os escopos HTTP são `/api/v1/internal`, `/api/v1/admin` e `/api/v1/public`. A API pública informa a versão em cada resposta. Mudanças incompatíveis exigem nova versão major e período de convivência. Polling foi escolhido porque dispensa o cadastro de destinos e o gerenciamento de entregas. OAuth2 client credentials pode ser avaliado quando parceiros exigirem identidade federada e tokens de curta duração.

## Evolução para centenas ou milhares de parceiros

O primeiro passo é escalar workers horizontalmente e medir espera na fila, duração, tentativas, falhas e uso de memória. Limites de concorrência por parceiro e filas por prioridade ajudam a evitar que uma única carga atrase os demais. Planos podem combinar cotas, escopos e prioridade com API gateway. O armazenamento de objetos com URLs assinadas reduz I/O e volume de backups do PostgreSQL.

O crescimento das tabelas pode ser tratado com particionamento mensal de transições e resultados, retenção por partição, réplicas de leitura e visões materializadas. Cache de metadados de chaves precisaria de invalidação imediata para revogação. Webhooks com assinatura HMAC podem complementar polling. A extração do módulo analítico torna-se justificável se seus acessos, requisitos operacionais ou cadência de implantação passarem a competir de forma persistente com a API transacional.
