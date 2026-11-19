/**
 * Hierarquia de exceções de negócio + catálogo ProblemType (REG-xxx / CAL-xxx).
 * Porte de domain/service/exception + api/exceptionhandler/enumeration/ProblemType.
 */
import type { EstadoItem } from "./model/types.js";

/** Base de todas as exceções de negócio — carrega código REG/CAL e campo. */
export class NegocioException extends Error {
  constructor(
    message: string,
    readonly codigo: string,
    readonly campo: string | null,
    readonly estadoItem: EstadoItem,
    /** Caminho relativo da documentação (uri do ProblemType). */
    readonly uri: string,
    readonly titulo: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

const f = (s: string, ...args: Array<string | number | null | undefined>): string => {
  let i = 0;
  return s.replace(/%[dfs]/g, () => String(args[i++]));
};

// ─── REG (inconsistência de entrada) ─────────────────────────────────────────

export class CampoInvalidoException extends NegocioException {
  constructor(msg: string) {
    super(msg, "REG-024", null, "INCONSISTENCIA_ENTRADA", "campo-invalido", "Campo inválido");
  }
}

export class NcmNbsSimultaneasException extends NegocioException {
  constructor() {
    super(
      "Não é permitido informar NCM e NBS simultaneamente para um item",
      "REG-001",
      null,
      "INCONSISTENCIA_ENTRADA",
      "ncm-nbs-simultaneas",
      "NCM e NBS informadas simultaneamente",
    );
  }
}

export class NcmNaoEncontradaException extends NegocioException {
  constructor(ncm: string, data: string) {
    super(
      f("NCM de código %s não encontrada para a data %s", ncm, data),
      "REG-002",
      "ncm",
      "INCONSISTENCIA_ENTRADA",
      "ncm-nao-encontrada",
      "NCM não encontrada",
    );
  }
}

export class NbsNaoEncontradaException extends NegocioException {
  constructor(nbs: string, data: string) {
    super(
      f("NBS de código %s não encontrada para a data %s", nbs, data),
      "REG-003",
      "nbs",
      "INCONSISTENCIA_ENTRADA",
      "nbs-nao-encontrada",
      "NBS não encontrada",
    );
  }
}

export class SituacaoTributariaNaoEncontradaException extends NegocioException {
  constructor(codigo: string, data: string, tributo: string) {
    super(
      f("Situação tributária (CST) não encontrada para código %s e data %s (%s)", codigo, data, tributo),
      "REG-004",
      "cst",
      "INCONSISTENCIA_ENTRADA",
      "situacao-tributaria-nao-encontrada",
      "Situação tributária não encontrada",
    );
  }
}

export class ClassificacaoTributariaNaoEncontradaException extends NegocioException {
  constructor(arg: string | number, data?: string, tributo?: string) {
    super(
      typeof arg === "number"
        ? f("Classificação tributária não encontrada para id %s", arg)
        : f("Classificação tributária não encontrada para código %s e data %s (%s)", arg, data, tributo),
      "REG-005",
      "cClassTrib",
      "INCONSISTENCIA_ENTRADA",
      "classificacao-tributaria-nao-encontrada",
      "Classificação tributária não encontrada",
    );
  }
}

export class ClassificacaoTributariaNaoVinculadaSituacaoTributariaException extends NegocioException {
  constructor(cClassTrib: string, cst: string, tributo: string) {
    super(
      f("Classificação tributária (cClassTrib) de código %s não está vinculada à situação tributária (CST) de código %s (%s)", cClassTrib, cst, tributo),
      "REG-006",
      "cClassTrib",
      "INCONSISTENCIA_ENTRADA",
      "classificacao-tributaria-nao-vinculada-situacao-tributaria",
      "Classificação tributária não vinculada à situação tributária",
    );
  }
}

export class TratamentoClassificacaoNaoEncontradoException extends NegocioException {
  constructor(id: number, data: string) {
    super(
      f("Tratamento tributário não encontrado para classificação tributária com id %s e data %s", id, data),
      "REG-008",
      "cClassTrib",
      "INCONSISTENCIA_ENTRADA",
      "tratamento-classificacao-nao-encontrado",
      "Tratamento de classificação não encontrado",
    );
  }
}

export class TributacaoRegularNaoInformadaException extends NegocioException {
  constructor(cClassTrib: string, cst: string) {
    super(
      f("Dados da tributação regular devem ser informados para cClassTrib %s e CST %s", cClassTrib, cst),
      "REG-009",
      "tributacaoRegular",
      "INCONSISTENCIA_ENTRADA",
      "grupo-tributacao-regular-nao-informado",
      "Grupo de tributação regular não informado",
    );
  }
}

export class IncompatibilidadeSuspensaoException extends NegocioException {
  constructor(cClassTrib: string, cst: string) {
    super(
      f("Classificação tributária (cClassTrib) %s e situação tributária (CST) %s incompatíveis com suspensão", cClassTrib, cst),
      "REG-010",
      "tributacaoRegular/cClassTrib",
      "INCONSISTENCIA_ENTRADA",
      "incompatibilidade-suspensao",
      "Incompatibilidade com suspensão",
    );
  }
}

export class NcmNaoVinculadaException extends NegocioException {
  constructor(ncm: string, cClassTrib: string, tributo: string) {
    super(
      f("NCM de código %s não vinculada à Classificação Tributária de código %s (%s)", ncm, cClassTrib, tributo),
      "REG-011",
      "ncm",
      "INCONSISTENCIA_ENTRADA",
      "ncm-nao-vinculada",
      "NCM não vinculada",
    );
  }
}

export class NbsNaoVinculadaException extends NegocioException {
  constructor(nbs: string, cClassTrib: string, tributo: string) {
    super(
      f("NBS de código %s não vinculada à Classificação Tributária de código %s (%s)", nbs, cClassTrib, tributo),
      "REG-012",
      "nbs",
      "INCONSISTENCIA_ENTRADA",
      "nbs-nao-vinculada",
      "NBS não vinculada",
    );
  }
}

export class ImpostoSeletivoNaoInformadoException extends NegocioException {
  constructor(tipoNomenclatura: string, codigoNomenclatura: string, data: string) {
    super(
      f("Dados do Imposto Seletivo devem ser informados para %s %s e data %s", tipoNomenclatura, codigoNomenclatura, data),
      "REG-013",
      "impostoSeletivo",
      "INCONSISTENCIA_ENTRADA",
      "dados-imposto-seletivo-nao-informados",
      "Dados do Imposto Seletivo não informados",
    );
  }
}

export class NcmCompletoNaoInformadoException extends NegocioException {
  constructor() {
    super(
      "NCM completo não informado",
      "REG-015",
      "ncm",
      "INCONSISTENCIA_ENTRADA",
      "ncm-completo-nao-informado",
      "NCM completo não informado",
    );
  }
}

export class NbsCompletoNaoInformadoException extends NegocioException {
  constructor() {
    super(
      "NBS completo não informado",
      "REG-016",
      "nbs",
      "INCONSISTENCIA_ENTRADA",
      "nbs-completo-nao-informado",
      "NBS completo não informado",
    );
  }
}

export class MunicipioNaoEncontradoException extends NegocioException {
  constructor(id: number) {
    super(
      f("Município de código %d não encontrado", id),
      "REG-019",
      null,
      "INCONSISTENCIA_ENTRADA",
      "municipio-nao-encontrado",
      "Município não encontrado",
    );
  }
}

export class MunicipioNaoPertencenteException extends NegocioException {
  constructor(id: number, siglaUF: string) {
    super(
      f("Município de código %d não pertence à UF de sigla %s", id, siglaUF),
      "REG-018",
      null,
      "INCONSISTENCIA_ENTRADA",
      "municipio-nao-pertencente-uf",
      "Município não pertencente à UF",
    );
  }
}

export class UfNaoEncontradaException extends NegocioException {
  constructor(sigla: string) {
    super(
      f("UF de sigla %s não encontrada", sigla),
      "REG-020",
      null,
      "INCONSISTENCIA_ENTRADA",
      "uf-nao-encontrada",
      "UF não encontrada",
    );
  }
}

export class DataFatoGeradorNaoInformadaException extends NegocioException {
  constructor() {
    super(
      "A data do fato gerador não foi informada.",
      "REG-021",
      null,
      "INCONSISTENCIA_ENTRADA",
      "fato-gerador-nao-informada",
      "Data do fato gerador não informada",
    );
  }
}

export class ErroGenericoValidacaoException extends NegocioException {
  constructor(msg: string) {
    super(msg, "REG-023", null, "INCONSISTENCIA_ENTRADA", "erro-generico-validacao", "Erro genérico de validação");
  }
}

export class BaseCalculoNaoInformadaException extends NegocioException {
  constructor() {
    super(
      "A base de cálculo de CBS e IBS deve ser informada quando o grupo do Imposto Seletivo não é informado",
      "REG-025",
      "baseCalculo",
      "INCONSISTENCIA_ENTRADA",
      "base-calculo-nao-informada",
      "Base de cálculo não informada",
    );
  }
}

export class BaseCalculoInconsistenteException extends NegocioException {
  constructor(bc: string, bcIS: string, isInformado: string) {
    super(
      f("A base de cálculo de CBS e IBS informada %s difere da soma da base de cálculo do Imposto Seletivo %s com o Imposto Seletivo informado %s", bc, bcIS, isInformado),
      "REG-026",
      "baseCalculo",
      "INCONSISTENCIA_ENTRADA",
      "base-calculo-inconsistente",
      "Base de cálculo inconsistente",
    );
  }
}

export class BaseCalculoMenorBaseCalculoImpostoSeletivoException extends NegocioException {
  constructor(bc: string, bcIS: string) {
    super(
      f("A base de cálculo de CBS e IBS informada %s é menor que a base de cálculo do Imposto Seletivo %s", bc, bcIS),
      "REG-027",
      "baseCalculo",
      "INCONSISTENCIA_ENTRADA",
      "base-calculo-menor-base-calculo-imposto-seletivo",
      "Base de cálculo menor que a base de cálculo do Imposto Seletivo",
    );
  }
}

export class TipoDfeNaoEncontradoException extends NegocioException {
  constructor(tpDoc: number, data: string) {
    super(
      f("Tipo de documento fiscal (tpDoc) de código %d não encontrado ou fora de vigência na data %s", tpDoc, data),
      "REG-028",
      "tpDoc",
      "INCONSISTENCIA_ENTRADA",
      "tipo-documento-fiscal-nao-encontrado",
      "Tipo de documento fiscal não encontrado",
    );
  }
}

export class ClassificacaoTributariaNaoVinculadaTipoDfeException extends NegocioException {
  constructor(cClassTrib: string, tpDoc: number, tributos: string) {
    super(
      f("Classificação Tributária de código %s não vinculada ao tipo de documento fiscal (tpDoc) %d (%s)", cClassTrib, tpDoc, tributos),
      "REG-029",
      "cClassTrib",
      "INCONSISTENCIA_ENTRADA",
      "classificacao-tributaria-nao-vinculada-tipo-documento",
      "Classificação tributária não vinculada ao tipo de documento",
    );
  }
}

export class NomenclaturaIncompativelTipoDfeException extends NegocioException {
  constructor(nomenclatura: string, cClassTrib: string, siglaDfe: string) {
    super(
      f("%s não permitida para a Classificação Tributária de código %s no tipo de documento %s", nomenclatura, cClassTrib, siglaDfe),
      "REG-030",
      null,
      "INCONSISTENCIA_ENTRADA",
      "nomenclatura-incompativel-tipo-documento",
      "Nomenclatura incompatível com o tipo de documento",
    );
  }
}

export class ImpostoSeletivoNaoAdmitidoTipoDfeException extends NegocioException {
  constructor(tpDoc: number, nomenclatura: string, codigo: string) {
    super(
      f("O tipo de documento fiscal (tpDoc) %d não admite Imposto Seletivo, exigido para %s de código %s", tpDoc, nomenclatura, codigo),
      "REG-032",
      "impostoSeletivo",
      "INCONSISTENCIA_ENTRADA",
      "imposto-seletivo-nao-admitido-tipo-documento",
      "Imposto Seletivo não admitido pelo tipo de documento",
    );
  }
}

export class NomenclaturaObrigatoriaNaoInformadaException extends NegocioException {
  constructor(msg: string) {
    super(msg, "REG-033", null, "INCONSISTENCIA_ENTRADA", "nomenclatura-obrigatoria-nao-informada", "Nomenclatura obrigatória não informada");
  }
}

export class BaseCalculoComponentesInconsistenteException extends NegocioException {
  constructor(declarada: string, calculada: string) {
    super(
      f("A base de cálculo declarada (%s) diverge da base calculada a partir dos componentes informados (%s)", declarada, calculada),
      "REG-034",
      "baseCalculo",
      "INCONSISTENCIA_ENTRADA",
      "base-calculo-inconsistente",
      "Base de cálculo inconsistente",
    );
  }
}

export class AliquotaImpostoSeletivoNaoInformadaException extends NegocioException {
  constructor(tipoNomenclatura: string, codigoNomenclatura: string, data: string) {
    super(
      f("Dados do Imposto Seletivo devem ser informados para %s %s e data %s", tipoNomenclatura, codigoNomenclatura, data),
      "REG-035",
      "aliquotasNominais/impostoSeletivo",
      "INCONSISTENCIA_ENTRADA",
      "aliquota-imposto-seletivo-nao-informada",
      "Alíquota do Imposto Seletivo não informada",
    );
  }
}

export class AliquotasNominaisInformadasIndevidamenteException extends NegocioException {
  constructor() {
    super(
      "As alíquotas nominais não podem ser informadas para operações com fato gerador anterior a 01/01/2027, pois a calculadora resolve as alíquotas vigentes",
      "REG-036",
      "aliquotasNominais",
      "INCONSISTENCIA_ENTRADA",
      "aliquotas-nominais-informadas-indevidamente",
      "Alíquotas nominais informadas indevidamente",
    );
  }
}

export class AliquotasNominaisNaoInformadasException extends NegocioException {
  constructor() {
    super(
      "As alíquotas nominais (os três campos cbs, ibsEstadual e ibsMunicipal) devem ser informadas para operações com fato gerador a partir de 01/01/2027",
      "REG-037",
      "aliquotasNominais",
      "INCONSISTENCIA_ENTRADA",
      "aliquotas-nominais-nao-informadas",
      "Alíquotas nominais não informadas",
    );
  }
}

// ─── CAL (falha técnica) ─────────────────────────────────────────────────────

export class AliquotaNaoEncontradaException extends NegocioException {
  constructor(idTributo: number, codigoUf: number | null, municipio: number | null, data: string) {
    super(
      f("Alíquota de referencia ou padrão não encontrada para o tributo com id %s, UF %s, município %s e data %s", idTributo, codigoUf, municipio, data),
      "CAL-001",
      null,
      "FALHA_TECNICA",
      "aliquota-nao-encontrada",
      "Alíquota não encontrada",
    );
  }
}

export class AliquotaReferenciaNaoEncontradaException extends NegocioException {
  constructor(idTributo?: number, data?: string) {
    super(
      idTributo !== undefined
        ? f("Alíquota de referência não encontrada para o tributo %s na data %s", idTributo, data)
        : "Alíquota de referência obrigatória",
      "CAL-003",
      null,
      "FALHA_TECNICA",
      "aliquota-referencia-nao-encontrada",
      "Alíquota de referência não encontrada",
    );
  }
}

export class TipoAliquotaDesconhecidoException extends NegocioException {
  constructor(tipoAliquota: string, cClassTrib: string | null, cst: string | null) {
    super(
      f("Tipo de alíquota (%s) desconhecido para cClassTrib %s e CST %s", tipoAliquota, cClassTrib, cst),
      "CAL-006",
      null,
      "FALHA_TECNICA",
      "tipo-aliquota-desconhecido",
      "Tipo de alíquota desconhecido",
    );
  }
}

export class ErroFaltaImplementacaoException extends NegocioException {
  constructor(arg: string | number, ...args: Array<string | number>) {
    super(
      typeof arg === "number" || args.length === 0
        ? f("A classificação tributária %s ainda não possui tratamento tributário implementado na Calculadora. Essa funcionalidade está prevista no roadmap e será disponibilizada em versão futura.", arg)
        : f(arg, ...args),
      "CAL-007",
      "cClassTrib",
      "NAO_IMPLEMENTADO",
      "erro-falta-implementacao",
      "Classificação tributária em desenvolvimento",
    );
  }
}

export class ErroAvaliadorExpressaoException extends NegocioException {
  constructor(msg: string) {
    super(msg, "CAL-008", null, "FALHA_TECNICA", "erro-avaliador-expressao", "Erro no avaliador de expressão aritmética");
  }
}

export class TratamentoTributarioNaoEncontradoException extends NegocioException {
  constructor(id: number) {
    super(
      f("Tratamento tributário com id %s não encontrado", id),
      "CAL-009",
      null,
      "FALHA_TECNICA",
      "tratamento-tributario-nao-encontrado",
      "Tratamento tributário não encontrado",
    );
  }
}

export class PercentualReducaoNaoEncontradoException extends NegocioException {
  constructor(id: number, data: string) {
    super(
      f("Percentual de redução não encontrado para classificação tributária com id %s e data %s", id, data),
      "CAL-010",
      null,
      "FALHA_TECNICA",
      "percentual-reducao-nao-encontrado",
      "Percentual de redução não encontrado",
    );
  }
}

export class FundamentacaoClassificacaoNaoEncontradaException extends NegocioException {
  constructor(id: number, data: string) {
    super(
      f("Fundamentação não encontrada para classificação tributária com id %s e data %s", id, data),
      "CAL-011",
      null,
      "FALHA_TECNICA",
      "fundamentacao-nao-encontrada",
      "Fundamentação não encontrada",
    );
  }
}

// ─── Catálogo para o endpoint GET /observabilidade/erros ────────────────────

export interface CatalogoErro {
  codigo: string;
  campo: string | null;
  estado: EstadoItem;
  titulo: string;
  uri: string;
}

export const CATALOGO_ERROS: CatalogoErro[] = [
  { codigo: "REG-001", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "NCM e NBS informadas simultaneamente", uri: "ncm-nbs-simultaneas" },
  { codigo: "REG-002", campo: "ncm", estado: "INCONSISTENCIA_ENTRADA", titulo: "NCM não encontrada", uri: "ncm-nao-encontrada" },
  { codigo: "REG-003", campo: "nbs", estado: "INCONSISTENCIA_ENTRADA", titulo: "NBS não encontrada", uri: "nbs-nao-encontrada" },
  { codigo: "REG-004", campo: "cst", estado: "INCONSISTENCIA_ENTRADA", titulo: "Situação tributária não encontrada", uri: "situacao-tributaria-nao-encontrada" },
  { codigo: "REG-005", campo: "cClassTrib", estado: "INCONSISTENCIA_ENTRADA", titulo: "Classificação tributária não encontrada", uri: "classificacao-tributaria-nao-encontrada" },
  { codigo: "REG-006", campo: "cClassTrib", estado: "INCONSISTENCIA_ENTRADA", titulo: "Classificação tributária não vinculada à situação tributária", uri: "classificacao-tributaria-nao-vinculada-situacao-tributaria" },
  { codigo: "REG-007", campo: "ncm", estado: "INCONSISTENCIA_ENTRADA", titulo: "Erro de nomenclatura", uri: "erro-nomenclatura" },
  { codigo: "REG-008", campo: "cClassTrib", estado: "INCONSISTENCIA_ENTRADA", titulo: "Tratamento de classificação não encontrado", uri: "tratamento-classificacao-nao-encontrado" },
  { codigo: "REG-009", campo: "tributacaoRegular", estado: "INCONSISTENCIA_ENTRADA", titulo: "Grupo de tributação regular não informado", uri: "grupo-tributacao-regular-nao-informado" },
  { codigo: "REG-010", campo: "tributacaoRegular/cClassTrib", estado: "INCONSISTENCIA_ENTRADA", titulo: "Incompatibilidade com suspensão", uri: "incompatibilidade-suspensao" },
  { codigo: "REG-011", campo: "ncm", estado: "INCONSISTENCIA_ENTRADA", titulo: "NCM não vinculada", uri: "ncm-nao-vinculada" },
  { codigo: "REG-012", campo: "nbs", estado: "INCONSISTENCIA_ENTRADA", titulo: "NBS não vinculada", uri: "nbs-nao-vinculada" },
  { codigo: "REG-013", campo: "impostoSeletivo", estado: "INCONSISTENCIA_ENTRADA", titulo: "Dados do Imposto Seletivo não informados", uri: "dados-imposto-seletivo-nao-informados" },
  { codigo: "REG-014", campo: "impostoSeletivo", estado: "INCONSISTENCIA_ENTRADA", titulo: "Dados do Imposto Seletivo informados indevidamente", uri: "dados-imposto-seletivo-informados-indevidamente" },
  { codigo: "REG-015", campo: "ncm", estado: "INCONSISTENCIA_ENTRADA", titulo: "NCM completo não informado", uri: "ncm-completo-nao-informado" },
  { codigo: "REG-016", campo: "nbs", estado: "INCONSISTENCIA_ENTRADA", titulo: "NBS completo não informado", uri: "nbs-completo-nao-informado" },
  { codigo: "REG-018", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "Município não pertencente à UF", uri: "municipio-nao-pertencente-uf" },
  { codigo: "REG-019", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "Município não encontrado", uri: "municipio-nao-encontrado" },
  { codigo: "REG-020", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "UF não encontrada", uri: "uf-nao-encontrada" },
  { codigo: "REG-021", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "Data do fato gerador não informada", uri: "fato-gerador-nao-informada" },
  { codigo: "REG-022", campo: "tributacaoRegular", estado: "INCONSISTENCIA_ENTRADA", titulo: "Grupo de tributação regular informado indevidamente", uri: "grupo-tributacao-regular-informado-indevidamente" },
  { codigo: "REG-023", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "Erro genérico de validação", uri: "erro-generico-validacao" },
  { codigo: "REG-024", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "Campo inválido", uri: "campo-invalido" },
  { codigo: "REG-025", campo: "baseCalculo", estado: "INCONSISTENCIA_ENTRADA", titulo: "Base de cálculo não informada", uri: "base-calculo-nao-informada" },
  { codigo: "REG-026", campo: "baseCalculo", estado: "INCONSISTENCIA_ENTRADA", titulo: "Base de cálculo inconsistente", uri: "base-calculo-inconsistente" },
  { codigo: "REG-027", campo: "baseCalculo", estado: "INCONSISTENCIA_ENTRADA", titulo: "Base de cálculo menor que a base de cálculo do Imposto Seletivo", uri: "base-calculo-menor-base-calculo-imposto-seletivo" },
  { codigo: "REG-028", campo: "tpDoc", estado: "INCONSISTENCIA_ENTRADA", titulo: "Tipo de documento fiscal não encontrado", uri: "tipo-documento-fiscal-nao-encontrado" },
  { codigo: "REG-029", campo: "cClassTrib", estado: "INCONSISTENCIA_ENTRADA", titulo: "Classificação tributária não vinculada ao tipo de documento", uri: "classificacao-tributaria-nao-vinculada-tipo-documento" },
  { codigo: "REG-030", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "Nomenclatura incompatível com o tipo de documento", uri: "nomenclatura-incompativel-tipo-documento" },
  { codigo: "REG-031", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "Nomenclatura não permitida para o tipo de documento", uri: "nomenclatura-nao-permitida-tipo-documento" },
  { codigo: "REG-032", campo: "impostoSeletivo", estado: "INCONSISTENCIA_ENTRADA", titulo: "Imposto Seletivo não admitido pelo tipo de documento", uri: "imposto-seletivo-nao-admitido-tipo-documento" },
  { codigo: "REG-033", campo: null, estado: "INCONSISTENCIA_ENTRADA", titulo: "Nomenclatura obrigatória não informada", uri: "nomenclatura-obrigatoria-nao-informada" },
  { codigo: "REG-034", campo: "baseCalculo", estado: "INCONSISTENCIA_ENTRADA", titulo: "Base de cálculo inconsistente", uri: "base-calculo-inconsistente" },
  { codigo: "REG-035", campo: "aliquotasNominais/impostoSeletivo", estado: "INCONSISTENCIA_ENTRADA", titulo: "Alíquota do Imposto Seletivo não informada", uri: "aliquota-imposto-seletivo-nao-informada" },
  { codigo: "REG-036", campo: "aliquotasNominais", estado: "INCONSISTENCIA_ENTRADA", titulo: "Alíquotas nominais informadas indevidamente", uri: "aliquotas-nominais-informadas-indevidamente" },
  { codigo: "REG-037", campo: "aliquotasNominais", estado: "INCONSISTENCIA_ENTRADA", titulo: "Alíquotas nominais não informadas", uri: "aliquotas-nominais-nao-informadas" },
  { codigo: "CAL-001", campo: null, estado: "FALHA_TECNICA", titulo: "Alíquota não encontrada", uri: "aliquota-nao-encontrada" },
  { codigo: "CAL-002", campo: null, estado: "FALHA_TECNICA", titulo: "Alíquota padrão não encontrada", uri: "aliquota-padrao-nao-encontrada" },
  { codigo: "CAL-003", campo: null, estado: "FALHA_TECNICA", titulo: "Alíquota de referência não encontrada", uri: "aliquota-referencia-nao-encontrada" },
  { codigo: "CAL-004", campo: null, estado: "FALHA_TECNICA", titulo: "Alíquota ad rem não encontrada", uri: "aliquota-ad-rem-nao-encontrada" },
  { codigo: "CAL-005", campo: null, estado: "FALHA_TECNICA", titulo: "Alíquota negativa", uri: "aliquota-negativa" },
  { codigo: "CAL-006", campo: null, estado: "FALHA_TECNICA", titulo: "Tipo de alíquota desconhecido", uri: "tipo-aliquota-desconhecido" },
  { codigo: "CAL-007", campo: "cClassTrib", estado: "NAO_IMPLEMENTADO", titulo: "Classificação tributária em desenvolvimento", uri: "erro-falta-implementacao" },
  { codigo: "CAL-008", campo: null, estado: "FALHA_TECNICA", titulo: "Erro no avaliador de expressão aritmética", uri: "erro-avaliador-expressao" },
  { codigo: "CAL-009", campo: null, estado: "FALHA_TECNICA", titulo: "Tratamento tributário não encontrado", uri: "tratamento-tributario-nao-encontrado" },
  { codigo: "CAL-010", campo: null, estado: "FALHA_TECNICA", titulo: "Percentual de redução não encontrado", uri: "percentual-reducao-nao-encontrado" },
  { codigo: "CAL-011", campo: null, estado: "FALHA_TECNICA", titulo: "Fundamentação não encontrada", uri: "fundamentacao-nao-encontrada" },
  { codigo: "CAL-012", campo: null, estado: "FALHA_TECNICA", titulo: "Tributo/situação tributária não encontrado", uri: "tributo-situacao-tributaria-nao-encontrado" },
  { codigo: "CAL-999", campo: null, estado: "FALHA_TECNICA", titulo: "Erro interno do sistema", uri: "erro-interno-de-sistema" },
];
