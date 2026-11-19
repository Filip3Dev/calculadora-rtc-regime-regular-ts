/**
 * Testes da geração XML (Fase 2): geram um ROC real com o motor, convertem
 * para XML e (a) validam contra o grupo.xsd oficial via xmllint, (b) afirmam
 * valores e forma da saída (header JAXB, ordem de elementos, TDec).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Calculadora, gerarXml } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DB = process.env.RTC_DB ?? path.resolve(here, "../../../db/calculadora.db");
const XSD_NFE = path.resolve(here, "../../../db/xsd/nfe/grupo.xsd");

const skip = !existsSync(DB) || !existsSync(XSD_NFE);
const d = skip ? describe.skip : describe;

const INPUT = {
  id: "xml-e2e",
  versao: "0.0.1",
  dhFatoGerador: "2026-06-01T09:50:05-03:00",
  municipio: 4314902,
  uf: "RS",
  gCompraGov: { tpEnteGov: 1, tpOperGov: 1 },
  itens: [
    {
      numero: 1,
      ncm: "09024000",
      cst: "000",
      cClassTrib: "000001",
      baseCalculo: 200,
      quantidade: 1,
      unidade: "UN",
    },
  ],
};

function validarXsd(xml: string): { valido: boolean; erros: string[] } {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "rtc-xml-test-"));
  try {
    const f = path.join(tmp, "doc.xml");
    writeFileSync(f, xml, "utf8");
    const res = spawnSync("xmllint", ["--noout", "--noent", "--schema", XSD_NFE, f], { encoding: "utf8" });
    return { valido: res.status === 0, erros: (res.stderr ?? "").split("\n").filter(Boolean).filter((l) => !l.endsWith("validates")) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

d("geração XML (NF-e)", () => {
  it.each(["nfe", "nfce", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e"])(
    "tipo %s: XML válido contra o grupo.xsd oficial",
    (tipo) => {
      const calc = Calculadora.create(DB);
      try {
        const roc = calc.calcularTributos(INPUT);
        const xml = gerarXml(roc, tipo as never);
        const xsd = path.resolve(here, `../../../db/xsd/${tipo === "nfe" ? "nfe" : tipo}/grupo.xsd`);
        const tmp = mkdtempSync(path.join(os.tmpdir(), "rtc-x-"));
        try {
          const f = path.join(tmp, "d.xml");
          writeFileSync(f, xml, "utf8");
          const res = spawnSync("xmllint", ["--noout", "--noent", "--schema", xsd, f], { encoding: "utf8" });
          expect(res.status).toBe(0);
        } finally {
          rmSync(tmp, { recursive: true, force: true });
        }
      } finally {
        calc.close();
      }
    },
  );

  it("gera XML a partir do ROC real e valida contra o grupo.xsd oficial", () => {
    const calc = Calculadora.create(DB);
    try {
      const roc = calc.calcularTributos(INPUT);
      const xml = gerarXml(roc, "nfe");
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
      expect(xml).toContain('<infNFe xmlns="http://www.portalfiscal.inf.br/nfe">');
      const v = validarXsd(xml);
      expect(v.erros.slice(0, 3).join("\n")).toBe("");
      expect(v.valido).toBe(true);
    } finally {
      calc.close();
    }
  });

  it("estrutura: ide.gCompraGov + det[@nItem]/imosto + total, com valores TDec", () => {
    const calc = Calculadora.create(DB);
    try {
      const roc = calc.calcularTributos(INPUT);
      const xml = gerarXml(roc, "nfe");
      // compra gov presente (tpEnteGov=1 → código "1"; pRedutor 0 → "0.00")
      expect(xml).toContain("<gCompraGov>");
      expect(xml).toContain("<tpEnteGov>1</tpEnteGov>");
      expect(xml).toContain("<pRedutor>0.00</pRedutor>");
      // det com atributo nItem e grupos do imposto
      expect(xml).toContain('<det nItem="1">');
      expect(xml).toContain("<IBSCBS>");
      expect(xml).toContain("<CST>000</CST>");
      expect(xml).toContain("<cClassTrib>000001</cClassTrib>");
      // valores TDec do ROC (CBS 0,9% sobre 200 → 1.80)
      expect(xml).toContain("<vBC>200.00</vBC>");
      expect(xml).toContain("<pCBS>0.90</pCBS>");
      expect(xml).toContain("<vCBS>1.80</vCBS>");
      expect(xml).toContain("<pIBSUF>0.10</pIBSUF>");
      expect(xml).toContain("<vIBSUF>0.20</vIBSUF>");
      // totais
      expect(xml).toContain("<IBSCBSTot>");
      expect(xml).toContain("<vBCIBSCBS>200.00</vBCIBSCBS>");
      expect(xml).toContain("<vCBS>1.80</vCBS>");
      expect(xml).toContain("<vIBS>0.20</vIBS>");
      // memória de cálculo NÃO vai para o XML (não existe no leiaute)
      expect(xml).not.toContain("memoriaCalculo");
    } finally {
      calc.close();
    }
  });

  it("ordem dos elementos segue os propOrder JAXB (vBC antes de gIBSUF; vIBS antes de gCBS)", () => {
    const calc = Calculadora.create(DB);
    try {
      const roc = calc.calcularTributos(INPUT);
      const xml = gerarXml(roc, "nfe");
      const pos = (s: string) => xml.indexOf(s);
      expect(pos("<vBC>")).toBeLessThan(pos("<gIBSUF>"));
      expect(pos("<gIBSMun>")).toBeLessThan(pos("<vIBS>"));
      expect(pos("<vIBS>")).toBeLessThan(pos("<gCBS>"));
      expect(pos("<det")).toBeLessThan(pos("<total>"));
    } finally {
      calc.close();
    }
  });

  it("erros de entrada reproduzem as mensagens do original", () => {
    expect(() => gerarXml({} as never, "nfe")).toThrow("ROC deve conter ao menos um objeto");
    expect(() => gerarXml({ objetos: [{ nObj: 1 }] } as never, "nfe")).toThrow("Total do ROC não informado");
    expect(() => gerarXml({ objetos: [], total: {} } as never, "xxx" as never)).toThrow("não suportado");
  });
});
