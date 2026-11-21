import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';

// Executa os próprios exemplos HTTP, sem duplicar a jornada em outro cliente.
async function main() {
  const arquivo = await readFile(path.resolve('requests.http'), 'utf8');
  const blocos = arquivo.split(/^###.*$/m);
  const variaveis = new Map<string, string>();
  for (const linha of blocos[0].split(/\r?\n/)) {
    const m = linha.match(/^@(\w+)\s*=\s*(.*)$/); if (m) variaveis.set(m[1], m[2]);
  }
  const respostas: Record<string, any> = {};
  function expandir(s: string, nivel = 0): string {
    if (nivel > 10) throw new Error('Variáveis HTTP circulares.');
    return s.replace(/\{\{([^}]+)\}\}/g, (_t, expr: string) => {
      if (expr.startsWith('$dotenv ')) { const v = process.env[expr.slice(8).trim()]; if (!v) throw new Error(`Variável de ambiente ausente: ${expr}`); return v; }
      if (expr === '$datetime iso8601') return new Date().toISOString();
      if (expr === '$guid') return randomUUID();
      if (variaveis.has(expr)) return expandir(variaveis.get(expr)!, nivel + 1);
      const m = expr.match(/^(\w+)\.response\.body\.\$\.(.+)$/);
      if (m) {
        const chaves = m[2].replace(/\[(\d+)\]/g, '.$1').split('.');
        const v = chaves.reduce((o, chave) => o?.[chave], respostas[m[1]]);
        if (v === undefined) throw new Error(`Resposta HTTP sem campo: ${expr}`);
        return String(v);
      }
      throw new Error(`Variável HTTP desconhecida: ${expr}`);
    });
  }
  let total = 0;
  for (const bloco of blocos.slice(1)) {
    const nome = bloco.match(/^# @name (\w+)/m)?.[1]; if (!nome) continue;
    const esperados = (bloco.match(/^# @status ([\d,]+)/m)?.[1] ?? '200').split(',').map(Number);
    const linhas = bloco.trim().split(/\r?\n/).filter(l => !l.startsWith('#'));
    const requestLine = linhas.shift()!.match(/^(GET|POST|PUT|PATCH|DELETE) (.+)$/);
    if (!requestLine) throw new Error(`Requisição inválida: ${nome}`);
    const [, method, urlTemplate] = requestLine;
    const url = expandir(urlTemplate);
    const headers: Record<string, string> = {};
    while (linhas.length && linhas[0].trim()) { const l = linhas.shift()!; const i = l.indexOf(':'); headers[l.slice(0, i)] = expandir(l.slice(i + 1).trim()); }
    const corpo = linhas.join('\n').trim();
    let body = corpo ? expandir(corpo) : undefined;
    if (body && bloco.includes('# @version-from-organizacao')) {
      const objeto = JSON.parse(body); objeto.versao = respostas.organizacao?.contrato?.versao ?? 1; body = JSON.stringify(objeto);
    }
    const requisitar = () => fetch(url, { method, headers, body, signal: AbortSignal.timeout(15000) });
    let r = await requisitar();
    let conteudo = await r.text();
    if (bloco.includes('# @poll-concluida')) {
      const limite = Date.now() + 60000;
      while (r.ok && ['PENDENTE', 'EM_PROCESSAMENTO'].includes(JSON.parse(conteudo).status) && Date.now() < limite) {
        await esperar(1000);
        r = await requisitar();
        conteudo = await r.text();
      }
      if (r.ok && JSON.parse(conteudo).status !== 'CONCLUIDA') throw new Error('Relatório não concluído: ' + conteudo);
    }
    if (!esperados.includes(r.status)) throw new Error(`${nome}: HTTP ${r.status}, esperado ${esperados.join('/')}: ${conteudo}`);
    if (bloco.includes('# @csv')) {
      if (!r.headers.get('content-type')?.startsWith('text/csv') || !conteudo.includes('dimensao,chave,amostra')) throw new Error('Arquivo CSV inválido.');
    } else {
      respostas[nome] = conteudo ? JSON.parse(conteudo) : null;
    }
    if (r.status === 409 && bloco.includes('# @reuse-cnpj')) {
      const cnpj = JSON.parse(body!).cnpj.replace(/\D/g, '');
      const lista = await fetch(`${expandir('{{base}}')}/organizacoes?q=${cnpj}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!lista.ok) throw new Error('Não foi possível consultar a organização existente.');
      const id = (await lista.json() as any).items[0]?.id;
      if (!id) throw new Error('Organização existente não encontrada.');
      const org = await fetch(`${expandir('{{base}}')}/organizacoes/${id}`, { headers });
      if (!org.ok) throw new Error('Não foi possível obter a organização existente.');
      respostas[nome] = await org.json();
    }
    console.log(`${nome}: ${r.status}`); total++;
  }
  if (respostas.rastreio?.totalMovimentacoes !== 7 || respostas.consultarLote?.pesoTotal !== 2.5 || respostas.finalizar?.statusProcessamento !== 'FINALIZADO') throw new Error('Resultado da jornada inconsistente.');
  if (respostas.rastreioPublico?.equipamento?.statusRastreamento !== 'MATERIAL_RECICLAVEL' || respostas.historicoAnalises?.total < 1) throw new Error('Resultado da jornada de parceiro inconsistente.');
  console.log(`Jornada concluída: ${total} requisições de requests.http.`);
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
