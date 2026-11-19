import { describe, expect, it } from "vitest";
import { JBD } from "../model/jbd.js";
import { ExpressionEvaluator } from "./ExpressionEvaluator.js";

const avaliador = new ExpressionEvaluator();
const vars = (entries: Record<string, string | number | null>) =>
  new Map(Object.entries(entries).map(([k, v]) => [k, v === null ? null : JBD.of(v)] as const));

describe("ExpressionEvaluator — atalho de variável", () => {
  it("retorna o valor mapeado direto, sem arredondar", () => {
    const r = avaliador.evaluate("aliquota", vars({ aliquota: "0.123456789012" }));
    expect(r.toString()).toBe("0.123456789012");
  });

  it("lança erro quando a variável está mapeada com valor nulo", () => {
    expect(() => avaliador.evaluate("aliquota", vars({ aliquota: null }))).toThrow(
      "Valor não mapeado corretamente: aliquota",
    );
  });
});

describe("ExpressionEvaluator — aritmética", () => {
  it("multiplicação simples de variáveis", () => {
    const r = avaliador.evaluate("baseCalculo*aliquotaEfetiva", vars({ baseCalculo: 1000, aliquotaEfetiva: "0.208" }));
    expect(r.toPlainString()).toBe("208.00000000"); // arredondado a 8 casas
  });

  it("divisão não trunca para inteiro (5/100 = 0.05)", () => {
    const r = avaliador.evaluate("5/100", new Map());
    expect(r.toFixed(8)).toBe("0.05000000");
  });

  it("precedência padrão", () => {
    expect(avaliador.evaluate("1+2*3", new Map()).toString()).toBe("7.00000000");
    expect(avaliador.evaluate("(1+2)*3", new Map()).toString()).toBe("9.00000000");
  });

  it("literal numérico simples preserva escala do literal", () => {
    expect(avaliador.evaluate("0", new Map()).toString()).toBe("0.00000000");
    expect(avaliador.evaluate("1.00", new Map()).toString()).toBe("1.00000000"); // arredondarInterno
  });

  it("menos unário", () => {
    expect(avaliador.evaluate("-aliquota", vars({ aliquota: "0.5" })).toString()).toBe("-0.50000000");
    expect(avaliador.evaluate("1-aliquota", vars({ aliquota: "0.25" })).toString()).toBe("0.75000000");
  });
});

describe("ExpressionEvaluator — expressões reais do banco", () => {
  it("base de cálculo com imposto seletivo", () => {
    const r = avaliador.evaluate(
      "baseCalculoInformada-impostoSeletivoInformado+impostoSeletivoCalculado",
      vars({ baseCalculoInformada: 1100, impostoSeletivoInformado: 0, impostoSeletivoCalculado: 100 }),
    );
    expect(r.toFixed(8)).toBe("1200.00000000");
  });

  it("alíquota com redução e compra governamental", () => {
    const r = avaliador.evaluate(
      "aliquota*(1-percentualReducao)*(1-pRedutorCompraGov/100)",
      vars({ aliquota: "0.208", percentualReducao: "0.6", pRedutorCompraGov: 60 }),
    );
    expect(r.toFixed(8)).toBe("0.03328000");
  });

  it("biocombustível: pBio/(1-pBio) com 34 dígitos na divisão", () => {
    const r = avaliador.evaluate(
      "(pBio/(1-pBio))*quantidade*aliquotaAdRemSecundaria",
      vars({ pBio: "0.30000000", quantidade: 100, aliquotaAdRemSecundaria: "1.4" }),
    );
    expect(r.toFixed(8)).toBe("60.00000000");
  });

  it("imposto seletivo ad valorem + ad rem", () => {
    const r = avaliador.evaluate(
      "baseCalculo*aliquotaAdValorem+quantidade*aliquotaAdRem",
      vars({ baseCalculo: 1000, aliquotaAdValorem: "0.1", quantidade: 5, aliquotaAdRem: "1.5" }),
    );
    expect(r.toFixed(8)).toBe("107.50000000");
  });
});

describe("ExpressionEvaluator — erros", () => {
  it("divisão por zero", () => {
    expect(() => avaliador.evaluate("aliquota/0", vars({ aliquota: 1 }))).toThrow("Division by zero");
  });

  it("variável indefinida (JEXL strict)", () => {
    expect(() => avaliador.evaluate("naoExiste*2", new Map())).toThrow("Variável indefinida: naoExiste");
  });

  it("caractere inválido é rejeitado (sandbox por construção)", () => {
    expect(() => avaliador.evaluate("aliquota; drop table", vars({ aliquota: 1 }))).toThrow();
    expect(() => avaliador.evaluate("System.exit(1)", new Map())).toThrow();
    expect(() => avaliador.evaluate("'str' + 1", new Map())).toThrow();
  });

  it("expressão incompleta", () => {
    expect(() => avaliador.evaluate("1+", new Map())).toThrow();
    expect(() => avaliador.evaluate("(1+2", new Map())).toThrow();
  });
});
