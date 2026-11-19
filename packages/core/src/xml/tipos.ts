/**
 * Tipos comuns RTC (DFeTiposBasicos_v1.00) — builders com a ordem de elementos
 * dos propOrder JAXB. Campos nulos são omitidos (comportamento JAXB).
 */
import { el, grp, type XmlElem } from "./writer.js";
import { obj, str, val, type RocJson } from "./rocTypes.js";

/** TCompraGov: tpEnteGov (código), pRedutor (formatarAliquota), tpOperGov (código). */
export function tCompraGov(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  // PARITY: conversores do NfeXmlService — enum → código, pRedutor → formatarAliquota
  const pRedutorRaw = val(g, "pRedutor");
  const pRedutor = pRedutorRaw !== null ? formatarAliquotaXml(pRedutorRaw) : null;
  return grp("gCompraGov", [
    el("tpEnteGov", str(g, "tpEnteGov")),
    el("pRedutor", pRedutor),
    el("tpOperGov", str(g, "tpOperGov")),
  ]);
}

/** formatarAliquota do original (2–4 casas, HALF_EVEN, mínimo 2). */
function formatarAliquotaXml(v: string): string {
  const j = valorJbd(v);
  const s = j.setScale(4).toString();
  const [int, frac = ""] = s.split(".");
  let fracFinal = frac.replace(/0+$/, "");
  if (fracFinal.length < 2) fracFinal = frac.padEnd(2, "0").slice(0, 2);
  return `${int}.${fracFinal}`;
}

import { JBD } from "../model/jbd.js";
function valorJbd(v: string): JBD {
  return JBD.parse(v);
}

/** TDif: pDif, vDif. */
export function tDif(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gDif", [el("pDif", val(g, "pDif")), el("vDif", val(g, "vDif"))]);
}

/** TDevTrib: vDevTrib. */
export function tDevTrib(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gDevTrib", [el("vDevTrib", val(g, "vDevTrib"))]);
}

/** TRed: pRedAliq, pAliqEfet. */
export function tRed(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gRed", [el("pRedAliq", val(g, "pRedAliq")), el("pAliqEfet", val(g, "pAliqEfet"))]);
}

/** TTribRegular: CSTReg, cClassTribReg, pAliqEfetRegIBSUF, vTribRegIBSUF, pAliqEfetRegIBSMun, vTribRegIBSMun, pAliqEfetRegCBS, vTribRegCBS. */
export function tTribRegular(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gTribRegular", [
    el("CSTReg", str(g, "CSTReg")),
    el("cClassTribReg", str(g, "cClassTribReg")),
    el("pAliqEfetRegIBSUF", val(g, "pAliqEfetRegIBSUF")),
    el("vTribRegIBSUF", val(g, "vTribRegIBSUF")),
    el("pAliqEfetRegIBSMun", val(g, "pAliqEfetRegIBSMun")),
    el("vTribRegIBSMun", val(g, "vTribRegIBSMun")),
    el("pAliqEfetRegCBS", val(g, "pAliqEfetRegCBS")),
    el("vTribRegCBS", val(g, "vTribRegCBS")),
  ]);
}

/** TTribCompraGov: pAliqIBSUF, vTribIBSUF, pAliqIBSMun, vTribIBSMun, pAliqCBS, vTribCBS. */
export function tTribCompraGov(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gTribCompraGov", [
    el("pAliqIBSUF", val(g, "pAliqIBSUF")),
    el("vTribIBSUF", val(g, "vTribIBSUF")),
    el("pAliqIBSMun", val(g, "pAliqIBSMun")),
    el("vTribIBSMun", val(g, "vTribIBSMun")),
    el("pAliqCBS", val(g, "pAliqCBS")),
    el("vTribCBS", val(g, "vTribCBS")),
  ]);
}

/** Grupo de tributo (gIBSUF/gIBSMun/gCBS): pXX, gDif?, gDevTrib?, gRed?, vXX. */
function grupoTributo(
  nome: string,
  campoAliquota: string,
  campoValor: string,
  g: RocJson | null,
): XmlElem | null {
  if (!g) return null;
  return grp(nome, [
    el(campoAliquota, val(g, campoAliquota)),
    tDif(obj(g, "gDif")),
    tDevTrib(obj(g, "gDevTrib")),
    tRed(obj(g, "gRed")),
    el(campoValor, val(g, campoValor)),
  ]);
}

/** TCIBS: vBC, gIBSUF?, gIBSMun?, vIBS, gCBS?, gTribRegular?, gTribCompraGov?. */
export function tCibs(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gIBSCBS", [
    el("vBC", val(g, "vBC")),
    grupoTributo("gIBSUF", "pIBSUF", "vIBSUF", obj(g, "gIBSUF")),
    grupoTributo("gIBSMun", "pIBSMun", "vIBSMun", obj(g, "gIBSMun")),
    el("vIBS", val(g, "vIBS")),
    grupoTributo("gCBS", "pCBS", "vCBS", obj(g, "gCBS")),
    tTribRegular(obj(g, "gTribRegular")),
    tTribCompraGov(obj(g, "gTribCompraGov")),
  ]);
}

/** Subgrupos da monofasia (TMonofasia.GMono*). */
function gMonoPadrao(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gMonoPadrao", [
    el("qBCMono", val(g, "qBCMono")),
    el("adRemIBS", val(g, "adRemIBS")),
    el("adRemCBS", val(g, "adRemCBS")),
    el("vIBSMono", val(g, "vIBSMono")),
    el("vCBSMono", val(g, "vCBSMono")),
  ]);
}
function gMonoReten(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gMonoReten", [
    el("qBCMonoReten", val(g, "qBCMonoReten")),
    el("adRemIBSReten", val(g, "adRemIBSReten")),
    el("vIBSMonoReten", val(g, "vIBSMonoReten")),
    el("adRemCBSReten", val(g, "adRemCBSReten")),
    el("vCBSMonoReten", val(g, "vCBSMonoReten")),
  ]);
}
function gMonoRet(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gMonoRet", [
    el("qBCMonoRet", val(g, "qBCMonoRet")),
    el("adRemIBSRet", val(g, "adRemIBSRet")),
    el("vIBSMonoRet", val(g, "vIBSMonoRet")),
    el("adRemCBSRet", val(g, "adRemCBSRet")),
    el("vCBSMonoRet", val(g, "vCBSMonoRet")),
  ]);
}
function gMonoDif(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gMonoDif", [
    el("pDifIBS", val(g, "pDifIBS")),
    el("vIBSMonoDif", val(g, "vIBSMonoDif")),
    el("pDifCBS", val(g, "pDifCBS")),
    el("vCBSMonoDif", val(g, "vCBSMonoDif")),
  ]);
}

/** TMonofasia (gIBSCBSMono): grupos + totalizadores (propOrder do JAXB). */
export function tMonofasia(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("gIBSCBSMono", [
    gMonoPadrao(obj(g, "gMonoPadrao")),
    gMonoReten(obj(g, "gMonoReten")),
    gMonoRet(obj(g, "gMonoRet")),
    gMonoDif(obj(g, "gMonoDif")),
    el("vTotIBSMonoItem", val(g, "vTotIBSMonoItem")),
    el("vTotCBSMonoItem", val(g, "vTotCBSMonoItem")),
  ]);
}

/** TIS: CSTIS, cClassTribIS, [vBCIS, pIS, pISEspec?, [uTrib, qTrib], vIS]. */
export function tIs(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("IS", [
    el("CSTIS", str(g, "CSTIS")),
    el("cClassTribIS", str(g, "cClassTribIS")),
    el("vBCIS", val(g, "vBCIS")),
    el("pIS", val(g, "pIS")),
    el("pISEspec", val(g, "pISEspec")),
    el("uTrib", str(g, "uTrib")),
    el("qTrib", val(g, "qTrib")),
    el("vIS", val(g, "vIS")),
  ]);
}

/** TTribNFe: CST, cClassTrib, indDoacao?, gIBSCBS?, gIBSCBSMono?, (stubs null). */
export function tTribNFe(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("IBSCBS", [
    el("CST", str(g, "CST")),
    el("cClassTrib", str(g, "cClassTrib")),
    el("indDoacao", str(g, "indDoacao")),
    tCibs(obj(g, "gIBSCBS")),
    tMonofasia(obj(g, "gIBSCBSMono")),
    // gTransfCred/gAjusteCompet/gEstornoCred/gCredPresOper/gCredPresIBSZFM:
    // PARITY: stubs null no original (TODO) — omitidos
  ]);
}

/** TISTot: vIS. */
export function tIsTot(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  return grp("ISTot", [el("vIS", val(g, "vIS"))]);
}

/** TIBSCBSMonoTot: vBCIBSCBS, gIBS, gCBS, gMono, gEstornoCred?. */
export function tIbsCbsMonoTot(g: RocJson | null): XmlElem | null {
  if (!g) return null;
  const gIbs = obj(g, "gIBS");
  const gCbs = obj(g, "gCBS");
  const gMono = obj(g, "gMono");
  const gEstorno = obj(g, "gEstornoCred");
  return grp("IBSCBSTot", [
    el("vBCIBSCBS", val(g, "vBCIBSCBS")),
    gIbs
      ? grp("gIBS", [
          obj(gIbs, "gIBSUF")
            ? grp("gIBSUF", [el("vDif", val(obj(gIbs, "gIBSUF"), "vDif")), el("vDevTrib", val(obj(gIbs, "gIBSUF"), "vDevTrib")), el("vIBSUF", val(obj(gIbs, "gIBSUF"), "vIBSUF"))])
            : null,
          obj(gIbs, "gIBSMun")
            ? grp("gIBSMun", [el("vDif", val(obj(gIbs, "gIBSMun"), "vDif")), el("vDevTrib", val(obj(gIbs, "gIBSMun"), "vDevTrib")), el("vIBSMun", val(obj(gIbs, "gIBSMun"), "vIBSMun"))])
            : null,
          el("vIBS", val(gIbs, "vIBS")),
          el("vCredPres", val(gIbs, "vCredPres")),
          el("vCredPresCondSus", val(gIbs, "vCredPresCondSus")),
        ])
      : null,
    gCbs
      ? grp("gCBS", [
          el("vDif", val(gCbs, "vDif")),
          el("vDevTrib", val(gCbs, "vDevTrib")),
          el("vCBS", val(gCbs, "vCBS")),
          el("vCredPres", val(gCbs, "vCredPres")),
          el("vCredPresCondSus", val(gCbs, "vCredPresCondSus")),
        ])
      : null,
    gMono
      ? grp("gMono", [
          el("vIBSMono", val(gMono, "vIBSMono")),
          el("vCBSMono", val(gMono, "vCBSMono")),
          el("vIBSMonoReten", val(gMono, "vIBSMonoReten")),
          el("vCBSMonoReten", val(gMono, "vCBSMonoReten")),
          el("vIBSMonoRet", val(gMono, "vIBSMonoRet")),
          el("vCBSMonoRet", val(gMono, "vCBSMonoRet")),
        ])
      : null,
    gEstorno
      ? grp("gEstornoCred", [el("vIBSEstCred", val(gEstorno, "vIBSEstCred")), el("vCBSEstCred", val(gEstorno, "vCBSEstCred"))])
      : null,
  ]);
}
