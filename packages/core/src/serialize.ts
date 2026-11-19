/**
 * Serialização ROC → JSON — equivalente aos Serializers Jackson (TDec1302,
 * TDec0302_04, TDec1104, TCST, TcClassTrib, UTrib) + @JsonInclude(NON_NULL)
 * + @JsonPropertyOrder. Valores monetários/alíquotas saem como strings
 * formatadas, exatamente como na API oficial.
 */
import { formatarAliquota, formatarMoeda, formatarQuantidade, type JBD } from "./model/jbd.js";
import type {
  IBSCBSTotalDomain,
  ImpostoSeletivoDomain,
  MonofasiaDomain,
  ObjetoDomain,
  ROCDomain,
  TributacaoCompraGovernamentalDomain,
  TributacaoRegularDomain,
  ValoresTotaisDomain,
} from "./model/types.js";

type Json = Record<string, unknown>;

/** Remove chaves com valor undefined (equivalente a @JsonInclude(NON_NULL)). */
function clean<T>(o: T): T {
  if (Array.isArray(o)) return o.map(clean) as unknown as T;
  if (o && typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = clean(v);
    }
    return out as T;
  }
  return o;
}

const moeda = (v: JBD | null | undefined): string | undefined => (v === null || v === undefined ? undefined : formatarMoeda(v));
const aliq = (v: JBD | null | undefined): string | undefined => (v === null || v === undefined ? undefined : formatarAliquota(v));
const qtde = (v: JBD | null | undefined): string | undefined => (v === null || v === undefined ? undefined : formatarQuantidade(v));
const str = (v: string | null | undefined): string | undefined => (v === null || v === undefined ? undefined : v);

// Validadores de string (StringTCST/TcClassTrib/UTribSerializer)
function tcst(v: string): string {
  if (!/^\d{3}$/.test(v)) throw new Error("TCST deve ser uma string de exatamente 3 dígitos numéricos");
  return v;
}
function tcClassTrib(v: string): string {
  if (!/^\d{6}$/.test(v)) throw new Error("TcClassTrib deve ser uma string de exatamente 6 dígitos numéricos");
  return v;
}
function uTrib(v: string): string {
  if (v.length < 1 || v.length > 6) throw new Error("uTrib deve ter entre 1 e 6 caracteres");
  return v;
}

function difJson(d: { pDif: JBD; vDif: JBD } | null | undefined): Json | undefined {
  if (!d) return undefined;
  return { pDif: aliq(d.pDif), vDif: moeda(d.vDif) };
}

function redJson(r: { pRedAliq: JBD | null; pAliqEfet: JBD | null } | null | undefined): Json | undefined {
  if (!r) return undefined;
  return { pRedAliq: aliq(r.pRedAliq), pAliqEfet: aliq(r.pAliqEfet) };
}

function isJson(is: ImpostoSeletivoDomain | null | undefined): Json | undefined {
  if (!is) return undefined;
  return {
    CSTIS: str(is.CSTIS),
    cClassTribIS: str(is.cClassTribIS),
    vBCIS: moeda(is.vBCIS),
    pIS: aliq(is.pIS),
    pISEspec: aliq(is.pISEspec),
    adRemIS: aliq(is.adRemIS),
    uTrib: is.uTrib !== null && is.uTrib !== undefined ? uTrib(is.uTrib) : undefined,
    qTrib: qtde(is.qTrib),
    vIS: moeda(is.vIS),
    memoriaCalculo: str(is.memoriaCalculo),
  };
}

function tribRegularJson(tr: TributacaoRegularDomain | null | undefined): Json | undefined {
  if (!tr) return undefined;
  return {
    CSTReg: str(tr.CSTReg),
    cClassTribReg: str(tr.cClassTribReg),
    pAliqEfetRegIBSUF: aliq(tr.pAliqEfetRegIBSUF),
    vTribRegIBSUF: moeda(tr.vTribRegIBSUF),
    pAliqEfetRegIBSMun: aliq(tr.pAliqEfetRegIBSMun),
    vTribRegIBSMun: moeda(tr.vTribRegIBSMun),
    pAliqEfetRegCBS: aliq(tr.pAliqEfetRegCBS),
    vTribRegCBS: moeda(tr.vTribRegCBS),
  };
}

function compraGovJson(c: TributacaoCompraGovernamentalDomain | null | undefined): Json | undefined {
  if (!c) return undefined;
  return {
    pAliqIBSUF: aliq(c.pAliqIBSUF),
    vTribIBSUF: moeda(c.vTribIBSUF),
    pAliqIBSMun: aliq(c.pAliqIBSMun),
    vTribIBSMun: moeda(c.vTribIBSMun),
    pAliqCBS: aliq(c.pAliqCBS),
    vTribCBS: moeda(c.vTribCBS),
  };
}

function monofasiaJson(m: MonofasiaDomain | null | undefined): Json | undefined {
  if (!m) return undefined;
  const out: Json = {};
  if (m.gMonoPadrao) {
    out.gMonoPadrao = {
      qBCMono: qtde(m.gMonoPadrao.qBCMono),
      adRemIBS: aliq(m.gMonoPadrao.adRemIBS),
      adRemCBS: aliq(m.gMonoPadrao.adRemCBS),
      vIBSMono: moeda(m.gMonoPadrao.vIBSMono),
      vCBSMono: moeda(m.gMonoPadrao.vCBSMono),
    };
  }
  if (m.gMonoReten) {
    out.gMonoReten = {
      qBCMonoReten: qtde(m.gMonoReten.qBCMonoReten),
      adRemIBSReten: aliq(m.gMonoReten.adRemIBSReten),
      vIBSMonoReten: moeda(m.gMonoReten.vIBSMonoReten),
      adRemCBSReten: aliq(m.gMonoReten.adRemCBSReten),
      vCBSMonoReten: moeda(m.gMonoReten.vCBSMonoReten),
    };
  }
  if (m.gMonoRet) {
    out.gMonoRet = {
      qBCMonoRet: qtde(m.gMonoRet.qBCMonoRet),
      adRemIBSRet: aliq(m.gMonoRet.adRemIBSRet),
      vIBSMonoRet: moeda(m.gMonoRet.vIBSMonoRet),
      adRemCBSRet: aliq(m.gMonoRet.adRemCBSRet),
      vCBSMonoRet: moeda(m.gMonoRet.vCBSMonoRet),
    };
  }
  if (m.gMonoDif) {
    out.gMonoDif = {
      pDifIBS: aliq(m.gMonoDif.pDifIBS),
      vIBSMonoDif: moeda(m.gMonoDif.vIBSMonoDif),
      pDifCBS: aliq(m.gMonoDif.pDifCBS),
      vCBSMonoDif: moeda(m.gMonoDif.vCBSMonoDif),
    };
  }
  out.vTotIBSMonoItem = moeda(m.vTotIBSMonoItem);
  out.vTotCBSMonoItem = moeda(m.vTotCBSMonoItem);
  return out;
}

export function objetoJson(o: ObjetoDomain): Json {
  const out: Json = { nObj: o.nObj };
  if (o.tribCalc) {
    const trib: Json = {};
    if (o.tribCalc.IS) trib.IS = isJson(o.tribCalc.IS);
    const ibs = o.tribCalc.IBSCBS;
    if (ibs) {
      const ibsJson: Json = {
        CST: ibs.CST !== null && ibs.CST !== undefined ? tcst(ibs.CST) : undefined,
        cClassTrib: ibs.cClassTrib !== null && ibs.cClassTrib !== undefined ? tcClassTrib(ibs.cClassTrib) : undefined,
      };
      if (ibs.indDoacao !== null && ibs.indDoacao !== undefined) ibsJson.indDoacao = ibs.indDoacao;
      if (ibs.gIBSCBS) {
        const g = ibs.gIBSCBS;
        const gJson: Json = {};
        if (g.vBC !== null) gJson.vBC = moeda(g.vBC);
        if (g.gIBSUF) {
          gJson.gIBSUF = {
            pIBSUF: aliq(g.gIBSUF.pIBSUF),
            gDif: difJson(g.gIBSUF.gDif),
            gRed: redJson(g.gIBSUF.gRed),
            vIBSUF: moeda(g.gIBSUF.vIBSUF),
            memoriaCalculo: str(g.gIBSUF.memoriaCalculo),
          };
        }
        if (g.gIBSMun) {
          gJson.gIBSMun = {
            pIBSMun: aliq(g.gIBSMun.pIBSMun),
            gDif: difJson(g.gIBSMun.gDif),
            gRed: redJson(g.gIBSMun.gRed),
            vIBSMun: moeda(g.gIBSMun.vIBSMun),
            memoriaCalculo: str(g.gIBSMun.memoriaCalculo),
          };
        }
        gJson.vIBS = moeda(g.vIBS);
        if (g.gCBS) {
          gJson.gCBS = {
            pCBS: aliq(g.gCBS.pCBS),
            gDif: difJson(g.gCBS.gDif),
            gRed: redJson(g.gCBS.gRed),
            vCBS: moeda(g.gCBS.vCBS),
            memoriaCalculo: str(g.gCBS.memoriaCalculo),
          };
        }
        if (g.gTribRegular) gJson.gTribRegular = tribRegularJson(g.gTribRegular);
        if (g.gTribCompraGov) gJson.gTribCompraGov = compraGovJson(g.gTribCompraGov);
        ibsJson.gIBSCBS = gJson;
      }
      if (ibs.gIBSCBSMono) ibsJson.gIBSCBSMono = monofasiaJson(ibs.gIBSCBSMono);
      trib.IBSCBS = ibsJson;
    }
    out.tribCalc = trib;
  }
  out.calculoSimulado = o.calculoSimulado;
  return out;
}

export function totaisJson(t: ValoresTotaisDomain | null | undefined): Json | undefined {
  if (!t || !t.tribCalc) return undefined;
  const tribCalc = t.tribCalc as { ISTot: { vIS: JBD } | null; IBSCBSTot: IBSCBSTotalDomain | null };
  const out: Json = {};
  if (tribCalc.ISTot) out.ISTot = { vIS: moeda(tribCalc.ISTot.vIS) };
  if (tribCalc.IBSCBSTot) {
    const ib = tribCalc.IBSCBSTot;
    const ibJson: Json = { vBCIBSCBS: moeda(ib.vBCIBSCBS) };
    if (ib.gIBS) {
      const gibs: Json = {};
      if (ib.gIBS.gIBSUF) gibs.gIBSUF = { vDif: moeda(ib.gIBS.gIBSUF.vDif), vDevTrib: moeda(ib.gIBS.gIBSUF.vDevTrib), vIBSUF: moeda(ib.gIBS.gIBSUF.vIBSUF) };
      if (ib.gIBS.gIBSMun) gibs.gIBSMun = { vDif: moeda(ib.gIBS.gIBSMun.vDif), vDevTrib: moeda(ib.gIBS.gIBSMun.vDevTrib), vIBSMun: moeda(ib.gIBS.gIBSMun.vIBSMun) };
      gibs.vIBS = moeda(ib.gIBS.vIBS);
      gibs.vCredPres = moeda(ib.gIBS.vCredPres);
      gibs.vCredPresCondSus = moeda(ib.gIBS.vCredPresCondSus);
      ibJson.gIBS = gibs;
    }
    if (ib.gCBS) {
      ibJson.gCBS = {
        vDif: moeda(ib.gCBS.vDif),
        vDevTrib: moeda(ib.gCBS.vDevTrib),
        vCBS: moeda(ib.gCBS.vCBS),
        vCredPres: moeda(ib.gCBS.vCredPres),
        vCredPresCondSus: moeda(ib.gCBS.vCredPresCondSus),
      };
    }
    if (ib.gMono) {
      ibJson.gMono = {
        vIBSMono: moeda(ib.gMono.vIBSMono),
        vCBSMono: moeda(ib.gMono.vCBSMono),
        vIBSMonoReten: moeda(ib.gMono.vIBSMonoReten),
        vCBSMonoReten: moeda(ib.gMono.vCBSMonoReten),
        vIBSMonoRet: moeda(ib.gMono.vIBSMonoRet),
        vCBSMonoRet: moeda(ib.gMono.vCBSMonoRet),
      };
    }
    if (ib.gEstornoCred) {
      ibJson.gEstornoCred = { vIBSEstCred: moeda(ib.gEstornoCred.vIBSEstCred), vCBSEstCred: moeda(ib.gEstornoCred.vCBSEstCred) };
    }
    out.IBSCBSTot = ibJson;
  }
  return { tribCalc: out };
}

/** Serializa o ROC completo (POST /regime-geral). */
export function serializarROC(roc: { oper: unknown; objetos: ObjetoDomain[]; total: ValoresTotaisDomain | null }): Json {
  return clean(serializarROCInterno(roc));
}

function serializarROCInterno(roc: { oper: unknown; objetos: ObjetoDomain[]; total: ValoresTotaisDomain | null }): Json {
  const out: Json = {};
  if (roc.oper) out.oper = roc.oper;
  out.objetos = roc.objetos.map(objetoJson);
  const total = totaisJson(roc.total);
  if (total) out.total = total;
  return out;
}

/** Serializa gCompraGov do oper (OperacaoConsumoDomain). */
export function serializarOper(oper: unknown): Json | undefined {
  return clean(serializarOperInterno(oper));
}

function serializarOperInterno(oper: unknown): Json | undefined {
  if (!oper) return undefined;
  const o = oper as { gCompraGov: { tpEnteGov: number | null; pRedutor: JBD; tpOperGov: number | null } };
  if (!o.gCompraGov) return undefined;
  return {
    gCompraGov: {
      tpEnteGov: o.gCompraGov.tpEnteGov,
      pRedutor: moeda(o.gCompraGov.pRedutor),
      tpOperGov: o.gCompraGov.tpOperGov,
    },
  };
}


export type { Json };
