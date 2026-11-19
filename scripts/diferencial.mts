/**
 * Teste diferencial — dispara fixtures oficiais contra a API Java (oficial,
 * porta 8081) e a API TS (porta 8080) e compara respostas ao vivo:
 *
 *   1. regime-geral e observabilidade  → JSON campo a campo (inclui memoriaCalculo)
 *   2. casos de erro (validacoes)      → status + detail do ProblemDetail
 *   3. XML generate ×7 tipos           → byte a byte
 *
 * Uso: node scripts/diferencial.mts          (requer as duas APIs de pé)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const TS = process.env.TS_URL ?? "http://localhost:8080";
const JAVA = process.env.JAVA_URL ?? "http://localhost:8081";
const FIX =
  process.env.JAVA_FIXTURES ??
  "/Users/machado/Documents/projetos/pessoal/receita_federal/calculadora-rtc-regime-regular/src/test/resources";

interface Resultado {
  caso: string;
  tipo: "calculo" | "erro" | "xml";
  status: "IGUAL" | "DIFERENTE" | "ERRO";
  detalhes: string[];
}

const resultados: Resultado[] = [];

async function post(base: string, url: string, body: unknown, contentType = "application/json") {
  const res = await fetch(base + url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* resposta texto (XML) */
  }
  return { status: res.status, text, json };
}

/** Comparação profunda com caminho; ignora campos voláteis configuráveis. */
function diffJson(a: unknown, b: unknown, ignorar: Set<string>, pathStr = "$", out: string[] = []): string[] {
  if (ignorar.has(pathStr.replace(/\[\d+\]/g, "[]"))) return out;
  if (b === null || b === undefined) {
    if (a !== null && a !== undefined) out.push(`${pathStr}: TS=${JSON.stringify(a)} Java=null`);
    return out;
  }
  if (Array.isArray(b)) {
    if (!Array.isArray(a)) {
      out.push(`${pathStr}: TS não é array`);
      return out;
    }
    if (a.length !== b.length) out.push(`${pathStr}: lengths TS=${a.length} Java=${b.length}`);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) diffJson(a[i], b[i], ignorar, `${pathStr}[${i}]`, out);
    return out;
  }
  if (typeof b === "object") {
    if (typeof a !== "object" || a === null) {
      out.push(`${pathStr}: TS=${JSON.stringify(a)} Java=objeto`);
      return out;
    }
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
      if (ignorar.has(`${pathStr}.${k}`.replace(/\[\d+\]/g, "[]"))) continue;
      diffJson((a as Record<string, unknown>)[k], v, ignorar, `${pathStr}.${k}`, out);
    }
    return out;
  }
  if (String(a) !== String(b)) out.push(`${pathStr}: TS=${JSON.stringify(a)} Java=${JSON.stringify(b)}`);
  return out;
}

const VOLATEIS_ERRO = new Set(["$.instance", "$.timestamp"]);
const VOLATEIS_CALCULO = new Set<string>([]); // nada: compara memoriaCalculo também!

async function compararCalculo(nome: string, input: Record<string, unknown>) {
  const [ts, java] = await Promise.all([
    post(TS, "/api/calculadora/regime-geral", input),
    post(JAVA, "/api/calculadora/regime-geral", input),
  ]);
  const detalhes: string[] = [];
  if (ts.status !== java.status) detalhes.push(`status: TS=${ts.status} Java=${java.status}`);
  if (ts.status === 200 && java.status === 200) {
    detalhes.push(...diffJson(ts.json, java.json, VOLATEIS_CALCULO));
  } else if (ts.status !== 200 && java.status !== 200) {
    // erro de negócio: compara o detail (ProblemDetail)
    const dTs = (ts.json as Record<string, unknown>)?.detail;
    const dJava = (java.json as Record<string, unknown>)?.detail;
    if (String(dTs) !== String(dJava)) detalhes.push(`detail: TS=${dTs} Java=${dJava}`);
    const cTs = (ts.json as Record<string, unknown>)?.codigo;
    const cJava = (java.json as Record<string, unknown>)?.codigo ?? extrairCodigoJava(java.json);
    if (cTs && cJava && String(cTs) !== String(cJava)) detalhes.push(`codigo: TS=${cTs} Java=${cJava}`);
  }
  resultados.push({ caso: `regime-geral/${nome}`, tipo: ts.status === 200 ? "calculo" : "erro", status: detalhes.length ? "DIFERENTE" : "IGUAL", detalhes: detalhes.slice(0, 6) });

  const [tsO, javaO] = await Promise.all([
    post(TS, "/api/calculadora/observabilidade/regime-geral", input),
    post(JAVA, "/api/calculadora/observabilidade/regime-geral", input),
  ]);
  const detO: string[] = [];
  if (tsO.status !== javaO.status) detO.push(`status: TS=${tsO.status} Java=${javaO.status}`);
  detO.push(...diffJson(tsO.json, javaO.json, VOLATEIS_ERRO));
  resultados.push({ caso: `observabilidade/${nome}`, tipo: "calculo", status: detO.length ? "DIFERENTE" : "IGUAL", detalhes: detO.slice(0, 6) });

  return { ts, java };
}

/** Java não tem campo "codigo" no ProblemDetail — extrai do type (?codigo=REG-xxx) */
function extrairCodigoJava(json: unknown): string | undefined {
  const type = (json as Record<string, unknown>)?.type;
  const m = typeof type === "string" ? /\?codigo=([A-Z]+-\d+)/.exec(type) : null;
  return m?.[1];
}

async function compararXml(nome: string, rocTs: unknown, rocJava: unknown) {
  for (const tipo of ["nfe", "nfce", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e"]) {
    const [ts, java] = await Promise.all([
      post(TS, `/api/calculadora/xml/generate?tipo=${tipo}`, rocTs),
      post(JAVA, `/api/calculadora/xml/generate?tipo=${tipo}`, rocJava),
    ]);
    const detalhes: string[] = [];
    if (ts.status !== java.status) {
      detalhes.push(`status: TS=${ts.status} Java=${java.status}`);
      resultados.push({ caso: `xml/${tipo}/${nome}`, tipo: "xml", status: "DIFERENTE", detalhes });
      continue;
    }
    if (ts.status !== 200) continue; // ambos rejeitaram igualmente
    if (ts.text !== java.text) {
      // mostra a primeira linha divergente
      const lTs = ts.text.split("\n");
      const lJava = java.text.split("\n");
      let linha = 0;
      while (linha < Math.max(lTs.length, lJava.length) && lTs[linha] === lJava[linha]) linha++;
      detalhes.push(`linha ${linha + 1}:\n  TS  : ${(lTs[linha] ?? "").trim().slice(0, 110)}\n  Java: ${(lJava[linha] ?? "").trim().slice(0, 110)}`);
    }
    resultados.push({ caso: `xml/${tipo}/${nome}`, tipo: "xml", status: detalhes.length ? "DIFERENTE" : "IGUAL", detalhes });
  }
}

async function main() {
  if (!existsSync(FIX)) {
    console.error(`Fixtures não encontrados: ${FIX}`);
    process.exit(1);
  }

  // 1. cálculos corretos (usa as RESPOSTAS TS/Java para gerar XML)
  const varios = JSON.parse(readFileSync(`${FIX}/entradas/calculoscorretos/varios_itens/Teste_Varios_Itens.json`, "utf8"));
  const r = await compararCalculo("varios-itens", varios);
  if (r.ts.status === 200 && r.java.status === 200) {
    // varios itens só gera nfe/nfce (vários itens); cte/bpe exigem 1
    const [tsNfe, javaNfe] = await Promise.all([
      post(TS, "/api/calculadora/xml/generate?tipo=nfe", r.ts.json),
      post(JAVA, "/api/calculadora/xml/generate?tipo=nfe", r.java.json),
    ]);
    const det = tsNfe.text !== javaNfe.text ? ["(ver diff nas linhas)"] : [];
    if (det.length) {
      const lTs = tsNfe.text.split("\n");
      const lJava = javaNfe.text.split("\n");
      let linha = 0;
      while (linha < Math.max(lTs.length, lJava.length) && lTs[linha] === lJava[linha]) linha++;
      det.unshift(`linha ${linha + 1}:\n  TS  : ${(lTs[linha] ?? "").trim().slice(0, 110)}\n  Java: ${(lJava[linha] ?? "").trim().slice(0, 110)}`);
    }
    resultados.push({ caso: "xml/nfe/varios-itens", tipo: "xml", status: det.length ? "DIFERENTE" : "IGUAL", detalhes: det });
  }

  // 2. compras governamentais (1 item → XML nos 7 tipos)
  for (const cenario of ["cenario_01_uniao", "cenario_02_estado", "cenario_03_distrito_federal", "cenario_04_municipio", "cenario_05_consorcio", "cenario_06_comite_gestor"]) {
    const input = JSON.parse(readFileSync(`${FIX}/entradas/calculoscorretos/compras-governamentais/testes/${cenario}_input.json`, "utf8"));
    const r = await compararCalculo(cenario, input);
    if (r.ts.status === 200 && r.java.status === 200) {
      await compararXml(cenario, r.ts.json, r.java.json);
    }
  }

  // 3. casos de erro (validacoes) — status + detail
  const validacoes = readdirSync(`${FIX}/entradas/validacoes`).filter((f) => f.endsWith(".json"));
  for (const arq of validacoes) {
    const input = JSON.parse(readFileSync(`${FIX}/entradas/validacoes/${arq}`, "utf8"));
    const [ts, java] = await Promise.all([
      post(TS, "/api/calculadora/regime-geral", input),
      post(JAVA, "/api/calculadora/regime-geral", input),
    ]);
    const detalhes: string[] = [];
    if (ts.status !== java.status) detalhes.push(`status: TS=${ts.status} Java=${java.status}`);
    const dTs = (ts.json as Record<string, unknown>)?.detail;
    const dJava = (java.json as Record<string, unknown>)?.detail;
    if (String(dTs) !== String(dJava)) detalhes.push(`detail:\n  TS  : ${dTs}\n  Java: ${dJava}`);
    resultados.push({ caso: `erro/${arq.replace(".json", "")}`, tipo: "erro", status: detalhes.length ? "DIFERENTE" : "IGUAL", detalhes });
  }

  // ── resumo ──
  const iguais = resultados.filter((r) => r.status === "IGUAL").length;
  const dif = resultados.filter((r) => r.status === "DIFERENTE");
  console.log(`\n${"═".repeat(70)}\nRESULTADO: ${iguais}/${resultados.length} iguais · ${dif.length} diferentes\n${"═".repeat(70)}`);
  for (const r of dif) {
    console.log(`\n✗ ${r.caso}`);
    r.detalhes.forEach((d) => console.log(`   ${d}`));
  }
  if (dif.length === 0) console.log("\n🎉 PARIDADE TOTAL — TS ≡ Java em cálculo, erros e XML (byte a byte)");
  process.exit(dif.length === 0 ? 0 : 1);
}

void main();
