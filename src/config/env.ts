import 'dotenv/config';

export function lerEnv(fonte: NodeJS.ProcessEnv = process.env) {
  const numero = (nome: string, padrao: number, min: number, max: number) => {
    const valor = Number(fonte[nome] ?? padrao);
    if (!Number.isInteger(valor) || valor < min || valor > max) throw new Error(`${nome} inválido (${min}..${max}).`);
    return valor;
  };
  if (!fonte.DATABASE_URL || !/^postgres(ql)?:\/\//.test(fonte.DATABASE_URL)) throw new Error('DATABASE_URL PostgreSQL obrigatória.');
  if (!fonte.JWT_SECRET || fonte.JWT_SECRET.length < 32) throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
  if (fonte.JWT_EXPIRES_IN && fonte.JWT_EXPIRES_IN !== '30m') throw new Error('JWT_EXPIRES_IN deve ser 30m (regra R6).');
  const port = numero('PORT', 3000, 1, 65535);
  const nodeEnv = fonte.NODE_ENV ?? 'development';
  const queueMode = fonte.QUEUE_MODE ?? (nodeEnv === 'test' ? 'inline' : 'bullmq');
  if (queueMode !== 'inline' && queueMode !== 'bullmq') throw new Error('QUEUE_MODE inválido.');
  const redisUrl = fonte.REDIS_URL;
  for (const [nome, valor] of [['REDIS_URL', redisUrl], ['REDIS_URL_TEST', fonte.REDIS_URL_TEST]]) {
    if (valor && !/^rediss?:\/\//.test(valor)) throw new Error(nome + ' inválida.');
  }
  if (queueMode === 'bullmq' && !redisUrl) throw new Error('REDIS_URL é obrigatória em QUEUE_MODE=bullmq.');
  if (fonte.WORKER_EMBEDDED && !['true', 'false'].includes(fonte.WORKER_EMBEDDED)) throw new Error('WORKER_EMBEDDED inválido.');
  const analiseTz = fonte.ANALISE_TZ ?? 'America/Sao_Paulo';
  new Intl.DateTimeFormat('pt-BR', { timeZone: analiseTz });
  const logLevel = fonte.LOG_LEVEL ?? 'info';
  if (!['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(logLevel)) throw new Error('LOG_LEVEL inválido.');
  return {
    nodeEnv, databaseUrl: fonte.DATABASE_URL, queueMode, redisUrl,
    workerEmbedded: fonte.WORKER_EMBEDDED === 'true' && nodeEnv === 'development',
    workerConcurrency: numero('WORKER_CONCURRENCY', 2, 1, 32),
    analiseCron: fonte.ANALISE_CRON ?? '0 2 * * *',
    analiseTz,
    analiseRetencaoDias: numero('ANALISE_RETENCAO_DIAS', 90, 1, 730),
    relatorioTtlHoras: numero('RELATORIO_TTL_HORAS', 168, 1, 8760),
    relatorioMaxBytes: numero('RELATORIO_MAX_BYTES', 20971520, 1, 104857600),
    jobMaxTentativas: numero('JOB_MAX_TENTATIVAS', 5, 1, 15),
    apiKeyRotacaoGraceHoras: numero('API_KEY_ROTACAO_GRACE_HORAS', 24, 1, 720),
    idempotenciaTtlHoras: numero('IDEMPOTENCIA_TTL_HORAS', 24, 1, 720),
    publicRateLimitPadrao: numero('PUBLIC_RATE_LIMIT_PADRAO', 60, 1, 10000),
    jobBackoffMs: numero('JOB_BACKOFF_MS', 2000, 0, 60000),
    jwtSecret: fonte.JWT_SECRET, jwtExpiresIn: '30m',
    port, host: fonte.HOST ?? '0.0.0.0',
    corsOrigin: (fonte.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map(s => s.trim()),
    bcryptCost: numero('BCRYPT_COST', 12, 10, 16), logLevel,
    analiseJanelaDias: numero('ANALISE_JANELA_DIAS', 365, 1, 3650),
    analiseMinAmostra: numero('ANALISE_MIN_AMOSTRA', 8, 2, 10000),
    shutdownTimeoutMs: numero('SHUTDOWN_TIMEOUT_MS', 10000, 100, 120000),
  };
}
export type Config = ReturnType<typeof lerEnv>;
