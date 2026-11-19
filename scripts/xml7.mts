import { Calculadora, gerarXml } from "../packages/core/dist/index.js";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DB = path.resolve(import.meta.dirname, "../db/calculadora.db");
const XSD = path.resolve(import.meta.dirname, "../db/xsd");
const calc = Calculadora.create(DB);
const roc = calc.calcularTributos({
  id: "x", versao: "0.0.1", dhFatoGerador: "2026-06-01T09:50:05-03:00",
  municipio: 4314902, uf: "RS", gCompraGov: { tpEnteGov: 1, tpOperGov: 1 },
  itens: [{ numero: 1, ncm: "09024000", cst: "000", cClassTrib: "000001", baseCalculo: 200, quantidade: 1, unidade: "UN" }],
});
const tmp = mkdtempSync(path.join(os.tmpdir(), "x7-"));
for (const tipo of ["nfe", "nfce", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e"] as const) {
  try {
    const xml = gerarXml(roc as never, tipo);
    const f = path.join(tmp, "d.xml");
    writeFileSync(f, xml);
    const dir = tipo === "cte-simplificado" ? "cte-simplificado" : tipo;
    const r = spawnSync("xmllint", ["--noout", "--noent", "--schema", `${XSD}/${dir}/grupo.xsd`, f], { encoding: "utf8" });
    const root = xml.split("\n")[1]!.split(" ")[0]!.slice(1);
    const ok = r.status === 0;
    console.log(`${ok ? "✓" : "✗"} ${tipo.padEnd(17)} root=${root.padEnd(9)} xsd=${ok ? "VALIDA" : (r.stderr ?? "").split("\n").filter((l) => l.includes("error"))[0]?.slice(0, 90)}`);
  } catch (e) {
    console.log(`✗ ${tipo}: ERRO ${(e as Error).message}`);
  }
}
rmSync(tmp, { recursive: true, force: true });
calc.close();
