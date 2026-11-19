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
const tmp = mkdtempSync(path.join(os.tmpdir(), "x3-"));
for (const tipo of ["nfce", "bpe-tm", "nf3e"] as const) {
  const xml = gerarXml(roc as never, tipo);
  const f = path.join(tmp, "d.xml");
  writeFileSync(f, xml);
  const r = spawnSync("xmllint", ["--noout", "--schema", `${XSD}/${tipo}/grupo.xsd`, f], { encoding: "utf8" });
  const errs = (r.stderr ?? "").split("\n").filter((l) => l.includes("error")).slice(0, 2);
  console.log(`── ${tipo}:`);
  errs.forEach((e) => console.log("   ", e.replace(f, "doc")));
}
console.log("── nfce grupo.xsd (ide):"); 
const { readFileSync } = await import("node:fs");
const nfceXsd = readFileSync(`${XSD}/nfce/grupo.xsd`, "utf8");
console.log(nfceXsd.slice(nfceXsd.indexOf("xs:element name="), nfceXsd.indexOf("xs:element name=") + 400));
rmSync(tmp, { recursive: true, force: true });
calc.close();
