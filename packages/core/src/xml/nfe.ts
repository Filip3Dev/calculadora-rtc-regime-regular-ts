/**
 * Geração XML — porte fiel de XmlService + NfeXmlService/NfceXmlService.
 *
 * O XML gerado é o `infNFe` parcial do grupo RTC (grupo.xsd): ide.gCompraGov?,
 * det[].imposto{IS?, IBSCBS} e total{ISTot?, IBSCBSTot?}. A entrada é o ROC
 * (mesma saída do POST /regime-geral).
 */
import { writeXml, grp, el, type XmlElem } from "./writer.js";
import { arr, obj, str, val, type RocJson } from "./rocTypes.js";
import { tCompraGov, tIbsCbsMonoTot, tIs, tIsTot, tTribNFe } from "./tipos.js";

export const TIPOS_GERACAO = ["nfe", "nfce"] as const;
export type TipoGeracao = (typeof TIPOS_GERACAO)[number];

const NAMESPACES: Record<TipoGeracao, string> = {
  nfe: "http://www.portalfiscal.inf.br/nfe",
  nfce: "http://www.portalfiscal.inf.br/nfe",
};

const ROOTS: Record<TipoGeracao, string> = {
  nfe: "infNFe",
  nfce: "infNFe",
};

export class ErroGeracaoXml extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroGeracaoXml";
  }
}

/** XmlService.gerarXml(roc, tipo) — despacha para o builder do tipo. */
export function gerarXml(roc: RocJson, tipo: TipoGeracao): string {
  if (!TIPOS_GERACAO.includes(tipo)) {
    throw new ErroGeracaoXml(`Tipo '${tipo}' não suportado para geração. Use um de: ${TIPOS_GERACAO.join(", ")}`);
  }
  return gerarInfNFe(roc, tipo);
}

/** NfeXmlService.toXml / NfceXmlService.toXml (mesma forma). */
function gerarInfNFe(roc: RocJson, tipo: TipoGeracao): string {
  if (!roc || typeof roc !== "object") {
    throw new ErroGeracaoXml("ROC não pode ser nulo");
  }
  const objetos = arr(roc, "objetos");
  if (objetos.length === 0) {
    throw new ErroGeracaoXml("ROC deve conter ao menos um objeto");
  }
  const total = obj(roc, "total");
  const tribCalcTotal = total ? obj(total, "tribCalc") : null;
  if (!tribCalcTotal) {
    throw new ErroGeracaoXml("Total do ROC não informado");
  }

  // ide.gCompraGov (opcional)
  const oper = obj(roc, "oper");
  const gCompraGov = oper ? tCompraGov(obj(oper, "gCompraGov")) : null;
  const ide = gCompraGov ? grp("ide", [gCompraGov]) : null;

  // det[].imposto
  const dets: XmlElem[] = objetos.map((o): XmlElem => {
    const tribCalc = obj(o, "tribCalc");
    const imposto = grp("imposto", [tIs(tribCalc ? obj(tribCalc, "IS") : null), tTribNFe(tribCalc ? obj(tribCalc, "IBSCBS") : null)]);
    return grp("det", [imposto], { nItem: str(o, "nObj") ?? "" })!;
  });

  // total: ISTot? + IBSCBSTot
  const totalElem = grp("total", [
    tIsTot(tribCalcTotal ? obj(tribCalcTotal, "ISTot") : null),
    tIbsCbsMonoTot(tribCalcTotal ? obj(tribCalcTotal, "IBSCBSTot") : null),
  ]);

  const root = grp(ROOTS[tipo], [ide, ...dets, totalElem])!;
  return writeXml(root, NAMESPACES[tipo]);
}

/** Reexporta helpers para os demais tipos (Fase 3). */
export { val, str, obj, arr, el, grp };
