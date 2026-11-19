/**
 * Geração XML para todos os DF-e — porte fiel de XmlService + *XmlService.
 *
 * Formas por tipo (conforme modelos JAXB):
 *  nfe / nfce        → infNFe { ide.gCompraGov?, det[].imposto{IS?, IBSCBS}, total{ISTot?, IBSCBSTot} }
 *  cte / cte-simp.   → infCte { ide.gCompraGov?, imp.IBSCBS }            (ROC com exatamente 1 item)
 *  bpe               → infBPe { ide.gCompraGov?, imp.IBSCBS }            (ROC com exatamente 1 item)
 *  bpe-tm            → infBPe { ide.gCompraGov?, detBPeTM.det[].imp.IBSCBS, total.IBSCBSTot } (1 item)
 *  nf3e              → infNF3e { ide.gCompraGov?, NFdet[].det[].detItem.imposto.IBSCBS, total.IBSCBSTot }
 *
 * TTribCTe/BPe/NF3E: CST, cClassTrib, indDoacao?, gIBSCBS (TCIBS), gEstornoCred?
 * — sem monofasia/tribRegular/compraGov por item (leiautes próprios).
 * NFS-e: apenas validação no original (geracao=false) — paridade mantida.
 */
import { writeXml, grp, type XmlElem } from "./writer.js";
import { arr, obj, str, val, type RocJson } from "./rocTypes.js";
import { tCompraGov, tCibs, tIbsCbsMonoTot, tIs, tIsTot, tTribNFe } from "./tipos.js";

export const TIPOS_GERACAO = ["nfe", "nfce", "cte", "cte-simplificado", "bpe", "bpe-tm", "nf3e"] as const;
export type TipoGeracao = (typeof TIPOS_GERACAO)[number];

const NS: Record<TipoGeracao, string> = {
  nfe: "http://www.portalfiscal.inf.br/nfe",
  nfce: "http://www.portalfiscal.inf.br/nfe",
  cte: "http://www.portalfiscal.inf.br/cte",
  "cte-simplificado": "http://www.portalfiscal.inf.br/cte",
  bpe: "http://www.portalfiscal.inf.br/bpe",
  "bpe-tm": "http://www.portalfiscal.inf.br/bpe",
  nf3e: "http://www.portalfiscal.inf.br/nf3e",
};

export class ErroGeracaoXml extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroGeracaoXml";
  }
}

/** XmlService.gerarXml(roc, tipo). */
export function gerarXml(roc: RocJson, tipo: TipoGeracao): string {
  validarRocBasico(roc, tipo);
  switch (tipo) {
    case "nfe":
      return comRoot("infNFe", [ ...compraGovIde(roc), ...detsNFe(roc), totalNFe(roc) ]);
    case "nfce":
      // PARITY: NfceXmlService não mapeia gCompraGov (grupo.xsd do nfce sem ide)
      return comRoot("infNFe", [ ...detsNFe(roc), totalNFe(roc) ]);
    case "cte":
    case "cte-simplificado":
      return comRoot("infCte", [ ...compraGovIde(roc), impSimples(roc, "IBSCBS") ]);
    case "bpe":
      return comRoot("infBPe", [ ...compraGovIde(roc), impSimples(roc, "IBSCBS") ]);
    case "bpe-tm":
      return comRoot("infBPe", [ ...compraGovIde(roc), detsBpeTm(roc), totalSimples(roc) ]);
    case "nf3e":
      return comRoot("infNF3e", [ ...compraGovIde(roc), nfDets(roc), totalSimples(roc) ]);
  }
}

function comRoot(root: string, filhos: Array<XmlElem | null>): string {
  return writeXml(grp(root, filhos)!, NS[currentTipo]);
}

// tipo corrente (setado em gerarXml para resolver namespace em comRoot)
let currentTipo: TipoGeracao = "nfe";

function validarRocBasico(roc: RocJson, tipo: TipoGeracao): void {
  currentTipo = tipo;
  if (!TIPOS_GERACAO.includes(tipo)) {
    throw new ErroGeracaoXml(`Tipo '${tipo}' não suportado para geração. Use um de: ${TIPOS_GERACAO.join(", ")}`);
  }
  if (!roc || typeof roc !== "object") {
    throw new ErroGeracaoXml("ROC não pode ser nulo");
  }
  const objetos = arr(roc, "objetos");
  const exigeUmItem = tipo === "cte" || tipo === "cte-simplificado" || tipo === "bpe" || tipo === "bpe-tm";
  if (exigeUmItem) {
    if (objetos.length === 0 || objetos.length > 1) {
      throw new ErroGeracaoXml("ROC deve conter um item");
    }
  } else if (objetos.length === 0) {
    throw new ErroGeracaoXml("ROC deve conter ao menos um objeto");
  }
  if ((tipo === "nfe" || tipo === "nfce" || tipo === "bpe-tm" || tipo === "nf3e") && !obj(roc, "total")) {
    throw new ErroGeracaoXml("Total do ROC não informado");
  }
}

function compraGovIde(roc: RocJson): Array<XmlElem | null> {
  const oper = obj(roc, "oper");
  const g = oper ? tCompraGov(obj(oper, "gCompraGov")) : null;
  return [g ? grp("ide", [g]) : null];
}

/** TTribCTe/BPe/NF3E: CST, cClassTrib, indDoacao?, gIBSCBS, gEstornoCred?. */
function tTribSimples(ibsCbs: RocJson | null): XmlElem | null {
  if (!ibsCbs) return null;
  return grp("IBSCBS", [
    el2("CST", str(ibsCbs, "CST")),
    el2("cClassTrib", str(ibsCbs, "cClassTrib")),
    el2("indDoacao", str(ibsCbs, "indDoacao")),
    tCibs(obj(ibsCbs, "gIBSCBS")),
    // gEstornoCred: stub null no original
  ]);
}

import { el as el2 } from "./writer.js";

/** CT-e/BP-e: imp { IBSCBS } a partir do único objeto. */
function impSimples(roc: RocJson, _nome: string): XmlElem | null {
  const tribCalc = obj(arr(roc, "objetos")[0] ?? null, "tribCalc");
  return grp("imp", [tTribSimples(tribCalc ? obj(tribCalc, "IBSCBS") : null)]);
}

/** NFe/NFC-e: det[@nItem] { imposto { IS?, IBSCBS } } — TTribNFe completo (com monofasia). */
function detsNFe(roc: RocJson): XmlElem[] {
  return arr(roc, "objetos").map(
    (o): XmlElem =>
      grp(
        "det",
        [grp("imposto", [tIs(obj(obj(o, "tribCalc"), "IS")), tTribNFe(obj(obj(o, "tribCalc"), "IBSCBS"))])],
        { nItem: str(o, "nObj") ?? "" },
      )!,
  );
}

/** NFe/NFC-e: total { ISTot?, IBSCBSTot }. */
function totalNFe(roc: RocJson): XmlElem | null {
  const tribCalc = obj(obj(roc, "total"), "tribCalc");
  return grp("total", [tIsTot(tribCalc ? obj(tribCalc, "ISTot") : null), tIbsCbsMonoTot(tribCalc ? obj(tribCalc, "IBSCBSTot") : null)]);
}

/** BP-e TM: detBPeTM { det[@nViagem] { imp { IBSCBS } } } — nViagem = nObj (atributo obrigatório). */
function detsBpeTm(roc: RocJson): XmlElem | null {
  const dets = arr(roc, "objetos").map((o) => {
    const tribCalc = obj(o, "tribCalc");
    return grp(
      "det",
      [grp("imp", [tTribSimples(tribCalc ? obj(tribCalc, "IBSCBS") : null)])],
      { nViagem: str(o, "nObj") ?? "1" },
    );
  });
  return grp("detBPeTM", dets);
}

/** NF3-e: NFdet { det[@nItem] { detItem { imposto { IBSCBS } } } } — nItem = nObj (atributo). */
function nfDets(roc: RocJson): XmlElem | null {
  const dets = arr(roc, "objetos").map((o) => {
    const tribCalc = obj(o, "tribCalc");
    return grp(
      "det",
      [grp("detItem", [grp("imposto", [tTribSimples(tribCalc ? obj(tribCalc, "IBSCBS") : null)])])],
      { nItem: str(o, "nObj") ?? "1" },
    );
  });
  return grp("NFdet", dets);
}

/** total { IBSCBSTot } (TIBSCBSTot: sem gMono/vCredPres — BPe TM e NF3-e). */
function totalSimples(roc: RocJson): XmlElem | null {
  const tribCalc = obj(obj(roc, "total"), "tribCalc");
  const ib = tribCalc ? obj(tribCalc, "IBSCBSTot") : null;
  if (!ib) return grp("total", []);
  const gIbs = obj(ib, "gIBS");
  const gCbs = obj(ib, "gCBS");
  const ibsCbsTot = grp("IBSCBSTot", [
    el2("vBCIBSCBS", val(ib, "vBCIBSCBS")),
    gIbs
      ? grp("gIBS", [
          obj(gIbs, "gIBSUF")
            ? grp("gIBSUF", [el2("vDif", val(obj(gIbs, "gIBSUF"), "vDif")), el2("vDevTrib", val(obj(gIbs, "gIBSUF"), "vDevTrib")), el2("vIBSUF", val(obj(gIbs, "gIBSUF"), "vIBSUF"))])
            : null,
          obj(gIbs, "gIBSMun")
            ? grp("gIBSMun", [el2("vDif", val(obj(gIbs, "gIBSMun"), "vDif")), el2("vDevTrib", val(obj(gIbs, "gIBSMun"), "vDevTrib")), el2("vIBSMun", val(obj(gIbs, "gIBSMun"), "vIBSMun"))])
            : null,
          el2("vIBS", val(gIbs, "vIBS")),
        ])
      : null,
    gCbs
      ? grp("gCBS", [el2("vDif", val(gCbs, "vDif")), el2("vDevTrib", val(gCbs, "vDevTrib")), el2("vCBS", val(gCbs, "vCBS"))])
      : null,
  ]);
  return grp("total", [ibsCbsTot]);
}
