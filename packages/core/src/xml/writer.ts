/**
 * XmlWriter — serializador compatível com a saída JAXB_FORMATTED_OUTPUT:
 * header com standalone="yes", indentação de 2 espaços, namespace default no
 * root e omissão de elementos nulos (JAXB omite null não-nillable).
 */

export interface XmlElem {
  /** nome do elemento */
  n: string;
  /** texto do elemento (se folha) */
  t?: string | null;
  /** atributos */
  a?: Record<string, string>;
  /** filhos */
  c?: XmlElem[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Remove elementos nulos recursivamente (equivalente à omissão de null do JAXB). */
function denull(elems: XmlElem[]): XmlElem[] {
  return elems
    .filter((e) => e !== null && e !== undefined)
    .map((e) => ({ ...e, c: e.c ? denull(e.c) : undefined }))
    .filter((e) => e.t !== undefined || (e.c && e.c.length > 0) || e.a);
}

export function writeXml(root: XmlElem, namespace: string): string {
  const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const attrs = ` xmlns="${namespace}"`;
  return `${header}\n${serialize(root, attrs, 0)}\n`; // JAXB termina com quebra de linha
}

function serialize(e: XmlElem, rootAttrs: string, depth: number): string {
  const pad = "    ".repeat(depth); // JAXB_FORMATTED_OUTPUT indenta com 4 espaços
  const attrs =
    (rootAttrs && depth === 0 ? rootAttrs : "") +
    (e.a ? Object.entries(e.a).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join("") : "");
  if (e.c && e.c.length > 0) {
    const inner = denull(e.c).map((f) => serialize(f, "", depth + 1)).join("\n");
    return `${pad}<${e.n}${attrs}>\n${inner}\n${pad}</${e.n}>`;
  }
  if (e.t !== undefined && e.t !== null) {
    return `${pad}<${e.n}${attrs}>${escapeXml(e.t)}</${e.n}>`;
  }
  return `${pad}<${e.n}${attrs}/>`;
}

/** Helper: elemento folha com texto (omite se valor null/undefined). */
export function el(nome: string, valor: string | null | undefined): XmlElem | null {
  if (valor === null || valor === undefined) return null;
  return { n: nome, t: valor };
}

/** Helper: elemento contêiner (omite se não tiver filhos válidos). */
export function grp(nome: string, filhos: Array<XmlElem | null>, attrs?: Record<string, string>): XmlElem | null {
  const validos = denull(filhos.filter((f): f is XmlElem => f !== null));
  if (validos.length === 0 && !attrs) return null;
  return { n: nome, c: validos, a: attrs };
}
