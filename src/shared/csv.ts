type Celula = string | number | boolean | Date | null;

function escapar(celula: Celula) {
  let texto = celula instanceof Date ? celula.toISOString() : String(celula ?? '');
  if (typeof celula === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
  return /[",\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}

export function linhaCsv(linha: readonly Celula[]) {
  return linha.map(escapar).join(',') + '\r\n';
}

export function serializarCsv(colunas: readonly string[], linhas: Iterable<readonly Celula[]>) {
  const partes = ['\uFEFF' + linhaCsv(colunas)];
  for (const linha of linhas) partes.push(linhaCsv(linha));
  return partes.join('');
}
