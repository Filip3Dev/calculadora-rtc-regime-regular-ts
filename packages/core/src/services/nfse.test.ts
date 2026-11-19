import { describe, expect, it } from "vitest";
import { JBD } from "../model/jbd.js";
import {
  BaseCalculoUnificadaNfseService,
  OpcaoSimplesNacional,
  RegimeApuracaoIbsCbsSN,
  formatarCTribNac,
  tipoAjusteNfse,
  type BaseCalculoUnificadaNfseInput,
} from "./nfse.js";

const j = (v: number | string) => JBD.of(v)!;

function input(over: Partial<BaseCalculoUnificadaNfseInput>): BaseCalculoUnificadaNfseInput {
  return {
    anoFatoGerador: 2026,
    opSimpNac: OpcaoSimplesNacional.NAO_OPTANTE,
    situacao: "comum",
    vServ: j(1000),
    vDescIncond: null,
    vISSQN: null,
    vPIS: null,
    vCOFINS: null,
    regApIBSCBSSN: null,
    documentos: null,
    locacao: null,
    ...over,
  };
}

describe("BaseCalculoUnificadaNfseService", () => {
  const svc = new BaseCalculoUnificadaNfseService();

  it("operação comum não optante: RG = vServ − desc − ISSQN − PIS − COFINS; SN nula", () => {
    const r = svc.calcular(input({ vDescIncond: j(100), vISSQN: j(50), vPIS: j(10), vCOFINS: j(20) }));
    expect(r.baseRG).toBe("820.00");
    expect(r.baseSN).toBeNull();
    expect(r.erros).toEqual([]);
  });

  it("2027+: PIS/COFINS deixam de ser deduzidos; 2033+: ISSQN também", () => {
    const r27 = svc.calcular(input({ anoFatoGerador: 2027, vISSQN: j(50), vPIS: j(10), vCOFINS: j(20) }));
    expect(r27.baseRG).toBe("950.00"); // só ISSQN deduz
    const r33 = svc.calcular(input({ anoFatoGerador: 2033, vISSQN: j(50), vPIS: j(10), vCOFINS: j(20) }));
    expect(r33.baseRG).toBe("1000.00"); // nada deduz
  });

  it("MEI: retorno antecipado com aviso E1302; documentos geram erro E0436", () => {
    const r = svc.calcular(
      input({ opSimpNac: OpcaoSimplesNacional.MEI, documentos: [{ tpAjusteBC: "101", vAjusteAplic: j(10), xTpAjusteBC: null }] }),
    );
    expect(r.baseRG).toBeNull();
    expect(r.baseSN).toBeNull();
    expect(r.avisos).toContain("E1302: Operação MEI: bases de cálculo não aplicáveis");
    expect(r.erros.map((e) => e.codigo)).toContain("E0436");
  });

  it("locação 99.03: bases proporcionais à copropriedade (50%)", () => {
    const r = svc.calcular(
      input({
        situacao: "locacao9903",
        locacao: { pCopropriedade: j(50), vTotOper: j(1000), vDescIncondTot: j(0), somaAjustesLocImoveis: j(0) },
      }),
    );
    expect(r.baseRG).toBe("500.00");
  });

  it("locação sem o grupo locacao → CampoInvalido (400)", () => {
    expect(() => svc.calcular(input({ situacao: "locacao9903" }))).toThrow(/Campo locacao obrigatório/);
  });

  it("optante sem regApIBSCBSSN gera erro EXXX-REGAP", () => {
    const r = svc.calcular(input({ opSimpNac: OpcaoSimplesNacional.OPTANTE_ME_E_EPP }));
    expect(r.erros.map((e) => e.codigo)).toContain("EXXX-REGAP");
  });

  it("optante ME/EPP com regime 1: baseSN = vServ − desc − ajustes IBS/CBS", () => {
    const r = svc.calcular(
      input({
        opSimpNac: OpcaoSimplesNacional.OPTANTE_ME_E_EPP,
        regApIBSCBSSN: RegimeApuracaoIbsCbsSN.IBS_CBS_PELO_SN,
        vDescIncond: j(100),
        documentos: [{ tpAjusteBC: "101", vAjusteAplic: j(50), xTpAjusteBC: null }],
      }),
    );
    expect(r.baseRG).toBe("850.00"); // 1000 − 100 − 50 (ISS/PIS/COFINS nulos)
    expect(r.baseSN).toBe("850.00");
  });

  it("salão parceiro + regime 1: deduz ajustes de profissional parceiro da baseSN", () => {
    const r = svc.calcular(
      input({
        opSimpNac: OpcaoSimplesNacional.OPTANTE_ME_E_EPP,
        regApIBSCBSSN: RegimeApuracaoIbsCbsSN.IBS_CBS_PELO_SN,
        situacao: "salaoParceiro",
        documentos: [
          { tpAjusteBC: "101", vAjusteAplic: j(100), xTpAjusteBC: null }, // repercute IBS/CBS
          { tpAjusteBC: "9", vAjusteAplic: j(60), xTpAjusteBC: null }, // profissional parceiro (só SN)
        ],
      }),
    );
    expect(r.baseRG).toBe("900.00"); // 1000 − 100 (tipo 101)
    expect(r.baseSN).toBe("840.00"); // 1000 − 100 − 60
  });

  it("E1534: soma dos ajustes ≥ valor do serviço", () => {
    const r = svc.calcular(input({ documentos: [{ tpAjusteBC: "101", vAjusteAplic: j(1000), xTpAjusteBC: null }] }));
    expect(r.erros.map((e) => e.codigo)).toContain("E1534");
  });

  it("tipo de ajuste desconhecido gera aviso e é ignorado; 199 sem descrição gera LEIAUTE-XTP", () => {
    const r = svc.calcular(
      input({
        documentos: [
          { tpAjusteBC: "999", vAjusteAplic: j(10), xTpAjusteBC: null },
          { tpAjusteBC: "199", vAjusteAplic: j(20), xTpAjusteBC: null },
        ],
      }),
    );
    expect(r.avisos.some((a) => a.includes("'999' desconhecido"))).toBe(true);
    expect(r.erros.map((e) => e.codigo)).toContain("LEIAUTE-XTP");
    expect(r.baseRG).toBe("1000.00"); // nenhum ajuste somado
  });
});

describe("formatarCTribNac", () => {
  it("formata códigos LC 116 (4 e 6 dígitos)", () => {
    expect(formatarCTribNac("0140")).toBe("1.40"); // PARITY: substring(0,2)+parseInt remove zero à esquerda, como no Java
    expect(formatarCTribNac("010905")).toBe("1.09.05");
    expect(formatarCTribNac(null)).toBeNull();
    expect(formatarCTribNac("123")).toBeNull();
  });
});

describe("tipoAjusteNfse", () => {
  it("tabela de repercussão fiel ao original", () => {
    expect(tipoAjusteNfse.isConhecido("101")).toBe(true);
    expect(tipoAjusteNfse.isConhecido("999")).toBe(false);
    expect(tipoAjusteNfse.repercuteIbsCbs("101")).toBe(true);
    expect(tipoAjusteNfse.repercuteIbsCbs("9")).toBe(false);
    expect(tipoAjusteNfse.repercuteSN("9")).toBe(true);
    expect(tipoAjusteNfse.requerDescricao("199")).toBe(true);
    expect(tipoAjusteNfse.requerDescricao("101")).toBe(false);
  });
});
