#!/usr/bin/env node
/**
 * CLI calculadora-rtc — cálculo CBS/IBS/IS (LC 214/2025) direto do terminal,
 * sobre o mesmo motor e banco da API (paridade estrita com a oficial).
 *
 * Uso:
 *   calculadora-rtc calc  <operacao.json> [opções]   regime-geral (JSON de saída)
 *   calculadora-rtc obs   <operacao.json> [opções]   observabilidade (erros por item)
 *   calculadora-rtc xml   <roc.json> --tipo nfe      XML do grupo RTC (7 DF-e)
 *   calculadora-rtc versao
 * Opções: --db <caminho.db> (default: banco embutido no pacote) · -o <saída.json>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Calculadora, gerarXml, TIPOS_GERACAO } from "./index.js";
import type { RocJson } from "./xml/rocTypes.js";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function dbPadrao(): string {
  const candidatos = [
    process.env.RTC_DB,
    path.join(PKG_ROOT, "db", "calculadora.db"), // embutido no pacote npm
    path.join(PKG_ROOT, "..", "..", "db", "calculadora.db"), // monorepo
    path.join(process.cwd(), "db", "calculadora.db"),
  ];
  return candidatos.find((c) => c !== undefined && existsSync(c)) ?? candidatos[1]!;
}

const args = process.argv.slice(2);
const comando = args[0];
const opts = new Map<string, string>();
const posicionais: string[] = [];
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === "--db" || a === "-o" || a === "--tipo" || a === "--base-url") {
    opts.set(a, args[++i]);
  } else if (a === "-h" || a === "--help") {
    usage();
    process.exit(0);
  } else {
    posicionais.push(a);
  }
}

function usage(): void {
  console.log(`calculadora-rtc — porte TS da Calculadora de Tributos da RTC (LC 214/2025)

  calculadora-rtc calc  <operacao.json>          cálculo regime-geral
  calculadora-rtc obs   <operacao.json>          observabilidade (erros por item)
  calculadora-rtc xml   <roc.json> --tipo nfe    XML do grupo RTC (nfe|nfce|cte|cte-simplificado|bpe|bpe-tm|nf3e)
  calculadora-rtc versao                         versão da base de dados
  --db <caminho>   banco SQLite (default: embutido no pacote)
  -o <saída>       grava em arquivo (default: stdout)`);
}

function saida(conteudo: string): void {
  const arquivo = opts.get("-o");
  if (arquivo) {
    writeFileSync(arquivo, conteudo + "\n");
    console.error(`✓ gravado em ${arquivo}`);
  } else {
    console.log(conteudo);
  }
}

try {
  if (comando === "versao") {
    const calc = Calculadora.create(dbPadrao());
    console.log(JSON.stringify(calc.versaoBase(), null, 2));
  } else if (comando === "calc" || comando === "obs") {
    if (!posicionais[0]) {
      usage();
      process.exit(2);
    }
    const operacao = JSON.parse(readFileSync(posicionais[0], "utf8"));
    const calc = Calculadora.create(dbPadrao());
    const resultado =
      comando === "calc"
        ? calc.calcularTributos(operacao)
        : calc.calcularTributosObservabilidade(operacao, opts.get("--base-url") ?? "http://localhost:8080");
    saida(JSON.stringify(resultado, null, 2));
  } else if (comando === "xml") {
    const tipo = opts.get("--tipo") ?? "nfe";
    if (!TIPOS_GERACAO.includes(tipo as never)) {
      console.error(`Tipo inválido: ${tipo}. Aceitos: ${TIPOS_GERACAO.join(", ")}`);
      process.exit(2);
    }
    if (!posicionais[0]) {
      usage();
      process.exit(2);
    }
    const roc = JSON.parse(readFileSync(posicionais[0], "utf8")) as RocJson;
    saida(gerarXml(roc, tipo as never));
  } else {
    usage();
    process.exit(comando ? 2 : 0);
  }
} catch (e) {
  console.error(`Erro: ${(e as Error).message}`);
  process.exit(1);
}
