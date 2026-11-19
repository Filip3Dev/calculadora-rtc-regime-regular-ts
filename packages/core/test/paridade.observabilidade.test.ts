/**
 * Golden tests de observabilidade — roda os 6 cenários oficiais de compra
 * governamental (entradas + gabaritos *_output_observabilidade.json do projeto
 * Java) contra o modo observabilidade do motor TS.
 *
 * Exclusões: memoriaCalculo e calculoSimulado (voláteis, como no teste de
 * regressão original). O campo estadoItem É comparado (é o coração do modo).
 */
import { readFileSync, existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { Calculadora } from "../src/index.js";

const JAVA_FIXTURES =
  process.env.JAVA_FIXTURES ??
  "/Users/machado/Documents/projetos/pessoal/receita_federal/calculadora-rtc-regime-regular/src/test/resources";
const DB = process.env.RTC_DB ?? new URL("../../../db/calculadora.db", import.meta.url).pathname;

const CENARIOS = [
  "cenario_01_uniao",
  "cenario_02_estado",
  "cenario_03_distrito_federal",
  "cenario_04_municipio",
  "cenario_05_consorcio",
  "cenario_06_comite_gestor",
];

const fixturesOk =
  existsSync(DB) &&
  existsSync(`${JAVA_FIXTURES}/entradas/calculoscorretos/compras-governamentais/testes/cenario_01_uniao_input.json`);

const d = fixturesOk ? describe : describe.skip;

/** Comparação profunda com caminho nas mensagens (mesma do golden regime-geral). */
function assertParidade(obtido: unknown, esperado: unknown, path = "$"): string[] {
  const diffs: string[] = [];
  if (esperado === null || esperado === undefined) {
    if ((obtido ?? null) !== null) diffs.push(`${path}: obtido=${JSON.stringify(obtido)} esperado=null`);
    return diffs;
  }
  if (Array.isArray(esperado)) {
    if (!Array.isArray(obtido)) {
      diffs.push(`${path}: esperado array`);
      return diffs;
    }
    esperado.forEach((v, i) => diffs.push(...assertParidade(obtido[i], v, `${path}[${i}]`)));
    return diffs;
  }
  if (typeof esperado === "object") {
    for (const [k, v] of Object.entries(esperado)) {
      if (k === "memoriaCalculo" || k === "calculoSimulado") continue;
      diffs.push(...assertParidade((obtido as Record<string, unknown>)?.[k], v, `${path}.${k}`));
    }
    for (const k of Object.keys((obtido ?? {}) as Record<string, unknown>)) {
      if (k === "memoriaCalculo" || k === "calculoSimulado") continue;
      if (!(k in (esperado as Record<string, unknown>))) diffs.push(`${path}.${k}: chave inesperada`);
    }
    return diffs;
  }
  if (String(obtido) !== String(esperado)) {
    diffs.push(`${path}: obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
  }
  return diffs;
}

d("golden observabilidade — compras governamentais", () => {
  const calc = Calculadora.create(DB);

  it.each(CENARIOS)("%s: estados, tributos e totais campo a campo", (cenario) => {
    const input = JSON.parse(
      readFileSync(`${JAVA_FIXTURES}/entradas/calculoscorretos/compras-governamentais/testes/${cenario}_input.json`, "utf8"),
    );
    const esperado = JSON.parse(
      readFileSync(
        `${JAVA_FIXTURES}/entradas/calculoscorretos/compras-governamentais/testes/${cenario}_output_observabilidade.json`,
        "utf8",
      ),
    );
    const obtido = calc.calcularTributosObservabilidade(input, "");
    const diffs = assertParidade(obtido, esperado);
    expect(diffs.slice(0, 20).join("\n")).toBe("");
  });

  it("modo com erro: item inválido reporta estado INCONSISTENCIA_ENTRADA + código REG", () => {
    const input = JSON.parse(
      readFileSync(`${JAVA_FIXTURES}/entradas/calculoscorretos/compras-governamentais/testes/cenario_01_uniao_input.json`, "utf8"),
    );
    const comErro = {
      ...input,
      itens: [...input.itens, { ...input.itens[0], numero: 2, ncm: "00000000" }],
    };
    const r = calc.calcularTributosObservabilidade(comErro, "");
    const objs = (r.objetos as Array<Record<string, unknown>>) ?? [];
    expect(objs[0]).toHaveProperty("estadoItem");
    expect(objs[1]).toHaveProperty("erros");
    const erros = objs[1].erros as Array<{ code: string; pointer: string }>;
    expect(erros[0].code).toBe("REG-002");
    expect(erros[0].pointer).toContain("#/itens/1");
  });

  afterAll(() => calc.close());
});
