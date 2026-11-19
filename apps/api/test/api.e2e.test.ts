/**
 * Testes e2e da API — sob a API real (requer banco em db/calculadora.db).
 * Executa com a API de pé (dev) ou via bootstrap próprio do Nest.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.API_URL ?? "http://localhost:8080/api";
const dbOk = existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/calculadora.db"));

const INPUT_OK = {
  id: "e2e",
  versao: "0.0.1",
  dhFatoGerador: "2026-06-01T09:50:05-03:00",
  municipio: 4314902,
  uf: "RS",
  itens: [{ numero: 1, ncm: "09024000", cst: "000", cClassTrib: "000001", baseCalculo: 200, quantidade: 1, unidade: "UN" }],
};

async function up(): Promise<boolean> {
  try {
    await (await fetch(`${BASE}/calculadora/versao`)).json();
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!dbOk)("API e2e", () => {
  beforeAll(async () => {
    for (let i = 0; i < 20; i++) {
      if (await up()) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("API não disponível — suba com pnpm dev:api");
  });

  it("GET /calculadora/versao retorna a versão da base", async () => {
    const v = await (await fetch(`${BASE}/calculadora/versao`)).json();
    expect(v.versao).toBeTruthy();
    expect(v.data).toBeTruthy();
  });

  it("POST /calculadora/regime-geral calcula com valores oficiais de referência", async () => {
    const res = await fetch(`${BASE}/calculadora/regime-geral`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(INPUT_OK),
    });
    expect(res.status).toBe(200);
    const roc = await res.json();
    const g = roc.objetos[0].tribCalc.IBSCBS.gIBSCBS;
    expect(g.vBC).toBe("200.00");
    expect(g.gCBS.vCBS).toBe("1.80"); // 200 × 0,9% (referência CBS 2026)
    expect(g.gIBSUF.vIBSUF).toBe("0.20"); // 200 × 0,1%
    expect(g.gIBSMun.vIBSMun).toBe("0.00");
    expect(g.gCBS.memoriaCalculo).toContain("R$ 200.00000000");
  });

  it("POST /calculadora/regime-geral com NCM inexistente → ProblemDetail 422 REG-002", async () => {
    const res = await fetch(`${BASE}/calculadora/regime-geral`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...INPUT_OK,
        itens: [{ ...INPUT_OK.itens[0], ncm: "00000000" }],
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.codigo).toBe("REG-002");
    expect(body.detail).toContain("NCM de código 00000000 não encontrada");
  });

  it("POST /calculadora/observabilidade/regime-geral reporta erros por item", async () => {
    const res = await fetch(`${BASE}/calculadora/observabilidade/regime-geral`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...INPUT_OK,
        itens: [INPUT_OK.itens[0], { ...INPUT_OK.itens[0], numero: 2, ncm: "00000000" }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objetos[0].estadoItem).toBe("CALCULADO");
    expect(body.objetos[1].estadoItem).toBe("INCONSISTENCIA_ENTRADA");
    expect(body.objetos[1].erros[0].code).toBe("REG-002");
  });

  it("POST /calculadora/base-calculo/base-calculo-unificada calcula as três bases", async () => {
    const res = await fetch(`${BASE}/calculadora/base-calculo/base-calculo-unificada`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        anoFatoGerador: 2026,
        tipoDocumento: 55,
        componentes: { vProd: 100, vFrete: 10, vDesc: 5, vPIS: 2 },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.baseRG).toBe("103.00000000"); // 100 + 10 − 5 − 2
    expect(body.baseIS).toBe("103.00000000");
  });

  it("GET /calculadora/dados-abertos/ufs e classificacoes-tributarias respondem", async () => {
    const ufs = await (await fetch(`${BASE}/calculadora/dados-abertos/ufs`)).json();
    expect(ufs.length).toBe(28);
    const cls = await (
      await fetch(`${BASE}/calculadora/dados-abertos/classificacoes-tributarias?data=2026-06-01`)
    ).json();
    expect(cls.length).toBeGreaterThan(100);
    expect(cls[0].codigo).toBe("000001");
  });

  it("POST /calculadora/xml/validate valida XML contra XSD oficial (xmllint)", async () => {
    const xmlInvalido = "<qualquer-coisa/>";
    const res = await fetch(`${BASE}/calculadora/xml/validate?tipo=nfe&subtipo=grupo`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: xmlInvalido,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valido).toBe(false);
    expect(body.erros.length).toBeGreaterThan(0);
  });

  it("POST /calculadora/nfse/base-calculo calcula a base NFS-e legada", async () => {
    const res = await fetch(`${BASE}/calculadora/nfse/base-calculo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anoFatoGerador: 2026, valorServico: 1000, descontoIncondicional: 50, pis: 10, cofins: 20, iss: 30 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ baseCalculo: "890.00" });
  });

  it("POST /calculadora/base-calculo/base-calculo-unificada-nfse (comum e locação)", async () => {
    const comum = await fetch(`${BASE}/calculadora/base-calculo/base-calculo-unificada-nfse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anoFatoGerador: 2026, opSimpNac: 1, situacao: "comum", vServ: 1000, vDescIncond: 100, vISSQN: 50, vPIS: 10, vCOFINS: 20 }),
    });
    expect(await comum.json()).toMatchObject({ baseRG: "820.00", baseSN: null });

    const loc = await fetch(`${BASE}/calculadora/base-calculo/base-calculo-unificada-nfse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        anoFatoGerador: 2026, opSimpNac: 1, situacao: "locacao9903",
        locacao: { pCopropriedade: 50, vTotOper: 1000, vDescIncondTot: 0, somaAjustesLocImoveis: 0 },
      }),
    });
    expect(await loc.json()).toMatchObject({ baseRG: "500.00" });
  });

  it("POST /calculadora/pedagio distribui CBS/IBS por praça (proporcional à extensão)", async () => {
    const res = await fetch(`${BASE}/calculadora/pedagio`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataHoraEmissao: "2026-06-01T08:00:00-03:00",
        codigoMunicipioOrigem: 4314902, ufMunicipioOrigem: "RS",
        cst: "000", cClassTrib: "000001", baseCalculo: 100, extensaoTotal: 100,
        trechos: [
          { numero: 1, municipio: 4314902, uf: "RS", extensao: 60 },
          { numero: 2, municipio: 4205407, uf: "SC", extensao: 40 },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // CBS referência 0,9%: trecho 1 (60%) → alíquota efetiva 0,54% → 0,54 sobre BC 100
    expect(body.trechos[0].cbs).toEqual({ aliquota: "0.90", aliquotaEfetiva: "0.54", tributoCalculado: "0.54" });
    expect(body.trechos[1].cbs.aliquotaEfetiva).toBe("0.36");
    expect(body.total.cbsTotal.valorTributo).toBe("0.90"); // 0.54 + 0.36
  });

  it("GET /calculadora/nfse/indicador-operacao e local-operacao respondem", async () => {
    const inds = await (await fetch(`${BASE}/calculadora/nfse/indicador-operacao?data=2026-06-01`)).json();
    expect(Array.isArray(inds)).toBe(true);
    expect(inds.length).toBeGreaterThan(0);
    const local = await (
      await fetch(`${BASE}/calculadora/nfse/local-operacao?cIndOp=${inds[0].cIndOp}&data=2026-06-01`)
    ).json();
    expect(local.cIndOp).toBe(inds[0].cIndOp);
    expect(local).toHaveProperty("codigoLocalFornecimento");
  });

  it("GET /calculadora/nfse/locais-fornecimento traz o catálogo (28 locais)", async () => {
    const locais = await (await fetch(`${BASE}/calculadora/nfse/locais-fornecimento`)).json();
    expect(locais.length).toBe(28);
  });

  it("GET /calculadora/dados-abertos novos endpoints (transferências, redutores, unidades)", async () => {
    const transf = await (await fetch(`${BASE}/calculadora/dados-abertos/transferencias-cbs?data=2027-06-01`)).json();
    expect(transf[0]).toMatchObject({ valor: 0, inicioVigencia: "2026-01-01", fimVigencia: "2028-12-31" });
    const red = await (await fetch(`${BASE}/calculadora/dados-abertos/redutores-compra-governamental?data=2026-06-01`)).json();
    expect(red.length).toBeGreaterThan(0);
    const um = await (await fetch(`${BASE}/calculadora/dados-abertos/unidades-medida?data=2026-06-01`)).json();
    expect(um.length).toBeGreaterThan(0);
  });

  it("GET /calculadora/observabilidade/erros consulta o catálogo", async () => {
    const body = await (await fetch(`${BASE}/calculadora/observabilidade/erros?codigo=REG-002`)).json();
    expect(body.codigo).toBe("REG-002");
    expect(body.campo).toBe("ncm");
  });
});
