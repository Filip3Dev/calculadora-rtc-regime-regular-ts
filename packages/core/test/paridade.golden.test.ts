/**
 * Golden tests de paridade — roda os fixtures oficiais do projeto Java
 * (entradas + gabaritos de saída) contra o motor TypeScript.
 *
 * Exclusões idênticas ao teste de regressão Java (TesteRegressaoVariosItens):
 * memoriaCalculo e calculoSimulado (campos voláteis entre versões).
 *
 * Requer o banco gerado: pnpm db:build
 */
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Calculadora } from "../src/index.js";

const JAVA_FIXTURES =
  process.env.JAVA_FIXTURES ??
  "/Users/machado/Documents/projetos/pessoal/receita_federal/calculadora-rtc-regime-regular/src/test/resources";
const DB = process.env.RTC_DB ?? new URL("../../../db/calculadora.db", import.meta.url).pathname;

// Os fixtures oficiais vivem no repositório Java original (clone local ou via
// JAVA_FIXTURES). Sem eles, os golden tests pulam — o restante da suíte roda.
const FIXTURES_OK =
  existsSync(JAVA_FIXTURES) &&
  existsSync(`${JAVA_FIXTURES}/entradas/calculoscorretos/varios_itens/Teste_Varios_Itens.json`);

const skip = !existsSync(DB) || !FIXTURES_OK;
const skipDb = skip ? describe.skip : describe;

/** Comparação estrutural profunda com caminho nas mensagens. */
function assertParidade(obtido: unknown, esperado: unknown, path = "$"): string[] {
  const diffs: string[] = [];
  if (esperado === null || esperado === undefined) {
    if ((obtido ?? null) !== null) diffs.push(`${path}: obtido=${JSON.stringify(obtido)} esperado=null`);
    return diffs;
  }
  if (Array.isArray(esperado)) {
    if (!Array.isArray(obtido)) {
      diffs.push(`${path}: esperado array, obtido ${typeof obtido}`);
      return diffs;
    }
    if (obtido.length !== esperado.length) {
      diffs.push(`${path}: tamanhos divergem (obtido ${obtido.length}, esperado ${esperado.length})`);
    }
    const n = Math.min(obtido.length, esperado.length);
    for (let i = 0; i < n; i++) {
      diffs.push(...assertParidade(obtido[i], esperado[i], `${path}[${i}]`));
    }
    return diffs;
  }
  if (typeof esperado === "object") {
    if (typeof obtido !== "object" || obtido === null) {
      diffs.push(`${path}: esperado objeto, obtido ${JSON.stringify(obtido)}`);
      return diffs;
    }
    for (const [k, v] of Object.entries(esperado)) {
      if (k === "memoriaCalculo" || k === "calculoSimulado") continue; // voláteis (excluídos no Java)
      diffs.push(...assertParidade((obtido as Record<string, unknown>)[k], v, `${path}.${k}`));
    }
    // chaves extras no obtido (exceto voláteis) também são divergência
    for (const k of Object.keys(obtido as Record<string, unknown>)) {
      if (k === "memoriaCalculo" || k === "calculoSimulado") continue;
      if (!(k in (esperado as Record<string, unknown>))) {
        diffs.push(`${path}.${k}: chave inesperada no resultado`);
      }
    }
    return diffs;
  }
  if (String(obtido) !== String(esperado)) {
    diffs.push(`${path}: obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
  }
  return diffs;
}

function fixture(rel: string): unknown {
  return JSON.parse(readFileSync(`${JAVA_FIXTURES}/${rel}`, "utf8"));
}

skipDb("paridade golden — cálculos corretos", () => {
  it("vários itens (regressão oficial, 262 objetos)", () => {
    const calc = Calculadora.create(DB);
    try {
      const input = fixture("entradas/calculoscorretos/varios_itens/Teste_Varios_Itens.json");
      const esperado = fixture("saidas/Teste_Varios_Itens.json");
      const obtido = calc.calcularTributos(input as never);
      const diffs = assertParidade(obtido, esperado);
      expect(diffs.slice(0, 30).join("\n")).toBe("");
    } finally {
      calc.close();
    }
  });

  it("compra governamental — cenário União (regime geral)", () => {
    const calc = Calculadora.create(DB);
    try {
      const input = fixture("entradas/calculoscorretos/compras-governamentais/testes/cenario_01_uniao_input.json");
      const esperado = fixture(
        "entradas/calculoscorretos/compras-governamentais/testes/cenario_01_uniao_output_regime_geral.json",
      );
      const obtido = calc.calcularTributos(input as never);
      const diffs = assertParidade(obtido, esperado);
      expect(diffs.slice(0, 30).join("\n")).toBe("");
    } finally {
      calc.close();
    }
  });

  it("compra governamental — cenário Estado (regime geral)", () => {
    const calc = Calculadora.create(DB);
    try {
      const input = fixture("entradas/calculoscorretos/compras-governamentais/testes/cenario_02_estado_input.json");
      const esperado = fixture(
        "entradas/calculoscorretos/compras-governamentais/testes/cenario_02_estado_output_regime_geral.json",
      );
      const obtido = calc.calcularTributos(input as never);
      const diffs = assertParidade(obtido, esperado);
      expect(diffs.slice(0, 30).join("\n")).toBe("");
    } finally {
      calc.close();
    }
  });

  it("compra governamental — cenário Município (regime geral)", () => {
    const calc = Calculadora.create(DB);
    try {
      const input = fixture("entradas/calculoscorretos/compras-governamentais/testes/cenario_04_municipio_input.json");
      const esperado = fixture(
        "entradas/calculoscorretos/compras-governamentais/testes/cenario_04_municipio_output_regime_geral.json",
      );
      const obtido = calc.calcularTributos(input as never);
      const diffs = assertParidade(obtido, esperado);
      expect(diffs.slice(0, 30).join("\n")).toBe("");
    } finally {
      calc.close();
    }
  });
});
