/**
 * Validação de entrada — equivalente Bean Validation das classes Input.
 * Usada pelo modo observabilidade (violacoes por item/campo) e pela API.
 */
import { JBD } from "./model/jbd.js";
import {
  AliquotasNominais,
  CompraGovernamentalInput,
  ComponentesBaseCalculoInput,
  ImpostoSeletivoInput,
  ItemOperacaoInput,
  OperacaoInput,
  TributacaoRegularInput,
  ElementoBaseCalculo,
  TipoEnteGovernamental,
  TipoOperacaoGovernamental,
  type ComponentesBaseCalculoJson,
  type ItemOperacaoJson,
  type OperacaoJson,
} from "./model/types.js";
import { DataFatoGeradorNaoInformadaException } from "./errors.js";

export interface ItemViolacao {
  anotacao: string; // nome da anotação equivalente (NotNull, Size, ...)
  campo: string;
  mensagem: string;
}

const digitos = (v: JBD): { inteiros: number; fracionarios: number } => {
  const s = v.dec.abs().toString();
  const [i, f] = s.split(".");
  // parte inteira sem zeros à esquerda
  const intStr = (i ?? "0").replace(/^0+/, "") || "0";
  return { inteiros: intStr === "0" ? 1 : intStr.length, fracionarios: (f ?? "").length };
};

/** Bean Validation do item (anotações de ItemOperacaoInput). */
export function validarItem(item: ItemOperacaoInput): ItemViolacao[] {
  const v: ItemViolacao[] = [];
  const numero = item.numero as number | null;
  if (numero === null || numero === undefined) {
    v.push({ anotacao: "NotNull", campo: "numero", mensagem: "não deve ser nulo" });
  } else if (numero < 1) {
    v.push({ anotacao: "Min", campo: "numero", mensagem: "deve ser maior ou igual a 1" });
  } else if (numero > 9999999) {
    v.push({ anotacao: "Max", campo: "numero", mensagem: "deve ser menor ou igual a 9999999" });
  }
  if (item.cst === null || item.cst === undefined) {
    v.push({ anotacao: "NotNull", campo: "cst", mensagem: "não deve ser nulo" });
  } else {
    if (!/^\d+$/.test(item.cst)) v.push({ anotacao: "Pattern", campo: "cst", mensagem: "Informar somente dígitos" });
    if (item.cst.length < 3 || item.cst.length > 3) {
      v.push({ anotacao: "Size", campo: "cst", mensagem: "tamanho deve estar entre 3 e 3" });
    }
  }
  if (item.cClassTrib === null || item.cClassTrib === undefined) {
    v.push({ anotacao: "NotNull", campo: "cClassTrib", mensagem: "não deve ser nulo" });
  } else {
    if (!/^\d+$/.test(item.cClassTrib)) v.push({ anotacao: "Pattern", campo: "cClassTrib", mensagem: "Informar somente dígitos" });
    if (item.cClassTrib.length < 6 || item.cClassTrib.length > 6) {
      v.push({ anotacao: "Size", campo: "cClassTrib", mensagem: "tamanho deve estar entre 6 e 6" });
    }
  }
  if (item.baseCalculo !== null) {
    if (item.baseCalculo.isNegative()) {
      v.push({ anotacao: "PositiveOrZero", campo: "baseCalculo", mensagem: "deve ser maior ou igual a 0" });
    } else {
      const d = digitos(item.baseCalculo);
      if (d.inteiros > 13 || d.fracionarios > 2) {
        v.push({ anotacao: "Digits", campo: "baseCalculo", mensagem: "números de dígitos fora do permitido (13 . 2)" });
      }
    }
  }
  if (item.quantidade !== null) {
    const d = digitos(item.quantidade);
    if (d.inteiros > 11 || d.fracionarios > 4) {
      v.push({ anotacao: "Digits", campo: "quantidade", mensagem: "números de dígitos fora do permitido (11 . 4)" });
    }
  }
  return v;
}

/** Bean Validation dos campos globais de OperacaoInput (id, versao, municipio, itens). */
export function validarOperacaoCamposGlobais(operacao: OperacaoInput): ItemViolacao[] {
  const v: ItemViolacao[] = [];
  if (!operacao.id) v.push({ anotacao: "NotNull", campo: "id", mensagem: "não deve ser nulo" });
  if (!operacao.versao) v.push({ anotacao: "NotNull", campo: "versao", mensagem: "não deve ser nulo" });
  if (operacao.municipio === null || operacao.municipio === undefined) {
    v.push({ anotacao: "NotNull", campo: "municipio", mensagem: "não deve ser nulo" });
  } else if (operacao.municipio < 0 || operacao.municipio > 9999999) {
    v.push({ anotacao: "Min", campo: "municipio", mensagem: "deve estar entre 0 e 9999999" });
  }
  if (operacao.uf !== null && operacao.uf !== undefined && operacao.uf.length !== 2) {
    v.push({ anotacao: "Size", campo: "uf", mensagem: "tamanho deve estar entre 2 e 2" });
  }
  if (operacao.tpDoc !== null && operacao.tpDoc !== undefined && (operacao.tpDoc < 1 || operacao.tpDoc > 999)) {
    v.push({ anotacao: "Min", campo: "tpDoc", mensagem: "deve estar entre 1 e 999" });
  }
  if (!operacao.itens || operacao.itens.length === 0) {
    v.push({ anotacao: "NotEmpty", campo: "itens", mensagem: "não deve estar vazio" });
  }
  return v;
}

// ─── Parsing JSON → modelo tipado (com JBD) ─────────────────────────────────

const jbd = (v: number | string | null | undefined): JBD | null =>
  v === null || v === undefined ? null : typeof v === "number" ? JBD.fromNumber(v) : JBD.parse(v);

export function parseComponentes(json: ComponentesBaseCalculoJson | null | undefined): ComponentesBaseCalculoInput | null {
  if (json === null || json === undefined) return null;
  const valores = new Map<ElementoBaseCalculo, JBD | null>();
  for (const e of ElementoBaseCalculo.TODOS) {
    valores.set(e, jbd((json as Record<string, unknown>)[e.campo] as number | string | null | undefined));
  }
  return new ComponentesBaseCalculoInput(valores);
}

export function parseItem(json: ItemOperacaoJson): ItemOperacaoInput {
  const is = json.impostoSeletivo
    ? new ImpostoSeletivoInput(
        json.impostoSeletivo.cst ?? null,
        json.impostoSeletivo.cClassTrib ?? null,
        jbd(json.impostoSeletivo.baseCalculo),
        jbd(json.impostoSeletivo.quantidade),
        json.impostoSeletivo.unidade ?? null,
        jbd(json.impostoSeletivo.impostoInformado),
      )
    : null;
  const tr = json.tributacaoRegular
    ? new TributacaoRegularInput(json.tributacaoRegular.cst ?? "", json.tributacaoRegular.cClassTrib ?? "")
    : null;
  const an = json.aliquotasNominais
    ? new AliquotasNominais(
        jbd(json.aliquotasNominais.cbs),
        jbd(json.aliquotasNominais.ibsEstadual),
        jbd(json.aliquotasNominais.ibsMunicipal),
        json.aliquotasNominais.impostoSeletivo
          ? {
              adValorem: jbd(json.aliquotasNominais.impostoSeletivo.adValorem),
              adRem: jbd(json.aliquotasNominais.impostoSeletivo.adRem),
            }
          : null,
      )
    : null;
  return new ItemOperacaoInput(
    json.numero,
    json.ncm ?? null,
    json.nbs ?? null,
    json.cst,
    json.cClassTrib,
    jbd(json.baseCalculo),
    jbd(json.quantidade),
    json.unidade ?? null,
    is,
    tr,
    parseComponentes(json.gComponentesBC),
    an,
  );
}

export function parseOperacao(json: OperacaoJson): OperacaoInput {
  const cg = json.gCompraGov
    ? new CompraGovernamentalInput(
        json.gCompraGov.tpEnteGov !== null && json.gCompraGov.tpEnteGov !== undefined
          ? (Number(json.gCompraGov.tpEnteGov) as TipoEnteGovernamental)
          : null,
        json.gCompraGov.tpOperGov !== null && json.gCompraGov.tpOperGov !== undefined
          ? (Number(json.gCompraGov.tpOperGov) as TipoOperacaoGovernamental)
          : null,
      )
    : null;
  return new OperacaoInput(
    json.id,
    json.versao,
    json.dhFatoGerador ?? null,
    json.dataHoraEmissao ?? null,
    json.municipio,
    json.uf ?? null,
    json.tpDoc ?? null,
    cg,
    (json.itens ?? []).map(parseItem),
  );
}
