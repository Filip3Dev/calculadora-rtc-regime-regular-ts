import { readFileSync } from "node:fs";
const FIX = "/Users/machado/Documents/projetos/pessoal/receita_federal/calculadora-rtc-regime-regular/src/test/resources";
const input = JSON.parse(readFileSync(`${FIX}/entradas/calculoscorretos/compras-governamentais/testes/cenario_01_uniao_input.json`, "utf8"));
const roc = await (await fetch("http://localhost:8080/api/calculadora/regime-geral", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })).json();
const ts = await (await fetch("http://localhost:8080/api/calculadora/xml/generate?tipo=nfe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(roc) })).text();
const javaRoc = await (await fetch("http://localhost:8081/api/calculadora/regime-geral", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })).json();
const java = await (await fetch("http://localhost:8081/api/calculadora/xml/generate?tipo=nfe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(javaRoc) })).text();
const lTs = ts.split("\n"), lJava = java.split("\n");
console.log("TS linhas:", lTs.length, "| Java linhas:", lJava.length);
console.log("TS últimas 4:", JSON.stringify(lTs.slice(-4)));
console.log("Java últimas 4:", JSON.stringify(lJava.slice(-4)));
// diferença invisível? compara char a char nas linhas após a última igual
let i = 0;
while (i < Math.min(lTs.length, lJava.length) && lTs[i] === lJava[i]) i++;
if (i < Math.min(lTs.length, lJava.length)) {
  console.log(`linha ${i + 1} TS  :`, JSON.stringify(lTs[i]));
  console.log(`linha ${i + 1} Java:`, JSON.stringify(lJava[i]));
} else {
  console.log("conteúdo igual até o fim da menor — diferença é de comprimento/final");
}
console.log("byte-a-byte igual?", ts === java);
console.log("TS termina:", JSON.stringify(ts.slice(-20)));
console.log("Java termina:", JSON.stringify(java.slice(-20)));
