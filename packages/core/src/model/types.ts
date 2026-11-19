/**
 * Modelos de entrada, internos e de saída (ROC) — porte dos records/classes Java.
 * Valores monetários/alíquotas/quantidades são JBD (BigDecimal Java com escala).
 */
import { JBD } from "./jbd.js";
import { DataFatoGeradorNaoInformadaException } from "../errors.js";

// ─── Enums ───────────────────────────────────────────────────────────────────

/** TributoEnum: id conforme tabela TRIBUTO. */
export enum Tributo {
  IS = 1,
  CBS = 2,
  IBS_ESTADUAL = 3,
  IBS_MUNICIPAL = 4,
}

export function tributoNome(t: Tributo): string {
  switch (t) {
    case Tributo.IS:
      return "Imposto Seletivo";
    case Tributo.CBS:
      return "CBS";
    case Tributo.IBS_ESTADUAL:
      return "IBS Estadual";
    case Tributo.IBS_MUNICIPAL:
      return "IBS Municipal";
  }
}

export enum TipoEnteGovernamental {
  UNIAO = 1,
  ESTADO = 2,
  DISTRITO_FEDERAL = 3,
  MUNICIPIO = 4,
  CONSORCIO_PUBLICO = 5,
  COMITE_GESTOR_IBS = 6,
}

export enum TipoOperacaoGovernamental {
  FORNECIMENTO_PAGAMENTO_POSTERIOR = 1,
  RECEBIMENTO_PAGAMENTO_FORNECIMENTO_REALIZADO = 2,
  FORNECIMENTO_PAGAMENTO_REALIZADO = 3,
  RECEBIMENTO_PAGAMENTO_POSTERIOR = 4,
  FORNECIMENTO_RECEBIMENTO_CONCOMITANTES = 5,
}

/** SiglasDFeEnum — sigla normalizada (sem espaços/hífens/underscores, minúscula). */
export const SiglasDFe = {
  NFE_ABI: "NFe ABI",
  NFE: "NFe",
  NFCE: "NFCe",
  CTE: "CTe",
  CTE_OS: "CTe OS",
  CTE_SIMPLIFICADO: "CT-e Simplificado",
  BPE: "BPe",
  BPE_TA: "BPe TA",
  BPE_TM: "BPe TM",
  NF3E: "NF3e",
  NFSE: "NFSe",
  NFSE_VIA: "NFSe Via",
  NFCOM: "NFCom",
  DERE: "DERE",
  DIR: "DIR",
  DUIMP: "Duimp",
  NFAG: "NFAg",
  NFGAS: "NFGas",
} as const;

export type SiglaDfe = (typeof SiglasDFe)[keyof typeof SiglasDFe];

/** Siglas sem tratamento na calculadora (ErroFaltaImplementacao ao usar tpDoc). */
const SEM_TRATAMENTO = new Set<string>([
  "nfeabi",
  "cteos",
  "nfsevia",
  "nfcom",
  "dere",
  "dir",
  "duimp",
  "nfag",
  "nfgas",
]);

export function normalizarSigla(sigla: string): string {
  return sigla.replace(/[ -_]/g, "").toLowerCase();
}

export function siglaPorNormalizada(norm: string): SiglaDfe {
  for (const s of Object.values(SiglasDFe)) {
    if (normalizarSigla(s) === norm) return s;
  }
  throw new Error(`Sigla de DFe desconhecida: ${siglaFromNorm(norm)}`);
}
function siglaFromNorm(n: string): string {
  return n;
}

export function semTratamentoCalculadora(sigla: string): boolean {
  return SEM_TRATAMENTO.has(normalizarSigla(sigla));
}

/** Documentos que admitem Imposto Seletivo (hoje NF-e e NFC-e). */
export function impostoSeletivoAplicavel(sigla: string): boolean {
  const n = normalizarSigla(sigla);
  return n === "nfe" || n === "nfce";
}

/** Siglas com validação rígida de nomenclatura. */
export function ehTrioRigido(sigla: string): boolean {
  const n = normalizarSigla(sigla);
  return n === "nfe" || n === "nfce" || n === "nfse";
}

export type BaseCalculoNatureza = "BEM" | "SERVICO";

export type EstadoItem =
  | "CALCULADO"
  | "INCONSISTENCIA_ENTRADA"
  | "FALHA_TECNICA"
  | "CALCULO_SIMULADO"
  | "NAO_IMPLEMENTADO";

// ─── Entrada (desserialização de JSON) ───────────────────────────────────────

export interface AliquotasNominaisImpostoSeletivoJson {
  adValorem?: number | string | null;
  adRem?: number | string | null;
}

export interface AliquotasNominaisJson {
  cbs?: number | string | null;
  ibsEstadual?: number | string | null;
  ibsMunicipal?: number | string | null;
  impostoSeletivo?: AliquotasNominaisImpostoSeletivoJson | null;
}

export interface ImpostoSeletivoJson {
  cst?: string | null;
  cClassTrib?: string | null;
  baseCalculo?: number | string | null;
  quantidade?: number | string | null;
  unidade?: string | null;
  impostoInformado?: number | string | null;
}

export interface TributacaoRegularJson {
  cst?: string | null;
  cClassTrib?: string | null;
}

export interface ComponentesBaseCalculoJson {
  vProd?: number | string | null;
  vFrete?: number | string | null;
  vSeg?: number | string | null;
  vOutro?: number | string | null;
  vII?: number | string | null;
  vIS?: number | string | null;
  vDesc?: number | string | null;
  vPIS?: number | string | null;
  vCOFINS?: number | string | null;
  vICMS?: number | string | null;
  vICMSUFDest?: number | string | null;
  vFCP?: number | string | null;
  vFCPUFDest?: number | string | null;
  vICMSMono?: number | string | null;
  vISSQN?: number | string | null;
}

export interface CompraGovernamentalJson {
  tpEnteGov?: string | null;
  tpOperGov?: string | null;
}

export interface ItemOperacaoJson {
  numero: number;
  ncm?: string | null;
  nbs?: string | null;
  cst: string;
  cClassTrib: string;
  baseCalculo?: number | string | null;
  quantidade?: number | string | null;
  unidade?: string | null;
  impostoSeletivo?: ImpostoSeletivoJson | null;
  tributacaoRegular?: TributacaoRegularJson | null;
  gComponentesBC?: ComponentesBaseCalculoJson | null;
  aliquotasNominais?: AliquotasNominaisJson | null;
}

export interface OperacaoJson {
  id: string;
  versao: string;
  dhFatoGerador?: string | null;
  /** @deprecated usar dhFatoGerador */
  dataHoraEmissao?: string | null;
  municipio: number;
  uf?: string | null;
  tpDoc?: number | null;
  gCompraGov?: CompraGovernamentalJson | null;
  itens: ItemOperacaoJson[];
}

// ─── Entrada (tipada, com JBD) ───────────────────────────────────────────────

export class AliquotasNominais {
  constructor(
    readonly cbs: JBD | null,
    readonly ibsEstadual: JBD | null,
    readonly ibsMunicipal: JBD | null,
    readonly impostoSeletivo: { adValorem: JBD | null; adRem: JBD | null } | null,
  ) {}
}

export class ImpostoSeletivoInput {
  constructor(
    readonly cst: string | null,
    readonly cClassTrib: string | null,
    readonly baseCalculo: JBD | null,
    readonly quantidade: JBD | null,
    readonly unidade: string | null,
    readonly impostoInformado: JBD | null,
  ) {}
  /** getValorImpostoSeletivoInformado: impostoInformado ?? ZERO. */
  getValorImpostoSeletivoInformado(): JBD {
    return this.impostoInformado ?? JBD.ZERO;
  }
}

export class TributacaoRegularInput {
  constructor(
    readonly cst: string,
    readonly cClassTrib: string,
  ) {}
}

export class ComponentesBaseCalculoInput {
  private readonly _map: Map<ElementoBaseCalculo, JBD | null>;
  constructor(valores: Map<ElementoBaseCalculo, JBD | null>) {
    this._map = valores;
  }

  get(elemento: ElementoBaseCalculo): JBD | null {
    return this._map.get(elemento) ?? null;
  }

  possuiComponentes(): boolean {
    for (const v of this._map.values()) {
      if (v !== null && v !== undefined) return true;
    }
    return false;
  }
}

export class CompraGovernamentalInput {
  constructor(
    readonly tpEnteGov: TipoEnteGovernamental | null,
    readonly tpOperGov: TipoOperacaoGovernamental | null,
  ) {}
}

export class ItemOperacaoInput {
  constructor(
    readonly numero: number,
    readonly ncm: string | null,
    readonly nbs: string | null,
    readonly cst: string,
    readonly cClassTrib: string,
    readonly baseCalculo: JBD | null,
    readonly quantidade: JBD | null,
    readonly unidade: string | null,
    readonly impostoSeletivo: ImpostoSeletivoInput | null,
    readonly tributacaoRegular: TributacaoRegularInput | null,
    readonly gComponentesBC: ComponentesBaseCalculoInput | null,
    readonly aliquotasNominais: AliquotasNominais | null,
  ) {}

  /** O processamento muta quantidade/unidade (defaults) — versão "with". */
  withDefaults(quantidade: JBD, unidade: string): ItemOperacaoInput {
    return new ItemOperacaoInput(
      this.numero,
      this.ncm,
      this.nbs,
      this.cst,
      this.cClassTrib,
      this.baseCalculo,
      quantidade,
      unidade,
      this.impostoSeletivo,
      this.tributacaoRegular,
      this.gComponentesBC,
      this.aliquotasNominais,
    );
  }

  withBaseCalculo(bc: JBD): ItemOperacaoInput {
    return new ItemOperacaoInput(
      this.numero,
      this.ncm,
      this.nbs,
      this.cst,
      this.cClassTrib,
      bc,
      this.quantidade,
      this.unidade,
      this.impostoSeletivo,
      this.tributacaoRegular,
      this.gComponentesBC,
      this.aliquotasNominais,
    );
  }

  withImpostoSeletivo(is: ImpostoSeletivoInput): ItemOperacaoInput {
    return new ItemOperacaoInput(
      this.numero,
      this.ncm,
      this.nbs,
      this.cst,
      this.cClassTrib,
      this.baseCalculo,
      this.quantidade,
      this.unidade,
      is,
      this.tributacaoRegular,
      this.gComponentesBC,
      this.aliquotasNominais,
    );
  }
}

export class OperacaoInput {
  constructor(
    readonly id: string,
    readonly versao: string,
    readonly dhFatoGerador: string | null,
    readonly dataHoraEmissao: string | null,
    readonly municipio: number,
    readonly uf: string | null,
    readonly tpDoc: number | null,
    readonly gCompraGov: CompraGovernamentalInput | null,
    readonly itens: ItemOperacaoInput[],
  ) {}

  get tpEnteGov(): TipoEnteGovernamental | null {
    return this.gCompraGov?.tpEnteGov ?? null;
  }

  /** LocalDate do fato gerador (parte da data do offset). */
  getFatoGeradorAplicavel(): string {
    const d = this.dhFatoGerador ?? this.dataHoraEmissao;
    if (d) return d.slice(0, 10);
    throw new DataFatoGeradorNaoInformadaException();
  }
}



// ─── ElementoBaseCalculo (catálogo de composição das bases) ──────────────────

export type BaseCalculoBase = "RG" | "IS" | "SN";
export type BaseCalculoOperacao = "SOMA" | "SUBTRAI";

export class ElementoBaseCalculo {
  private constructor(
    readonly tag: string,
    readonly campo: keyof ComponentesBaseCalculoJson,
    readonly operacao: BaseCalculoOperacao,
    readonly bases: Set<BaseCalculoBase>,
    readonly natureza: BaseCalculoNatureza | null,
    readonly anoInicio: number,
    readonly anoFim: number,
    readonly tiposDoc: Set<number>,
  ) {}

  private static defs: Array<
    [string, keyof ComponentesBaseCalculoJson, BaseCalculoOperacao, BaseCalculoBase[], BaseCalculoNatureza | null, number, number, number[]]
  > = [
    ["vProd", "vProd", "SOMA", ["RG", "IS", "SN"], null, 2026, 2033, [55, 65]],
    ["vFrete", "vFrete", "SOMA", ["RG", "IS", "SN"], null, 2026, 2033, [55, 65]],
    ["vSeg", "vSeg", "SOMA", ["RG", "IS", "SN"], null, 2026, 2033, [55, 65]],
    ["vOutro", "vOutro", "SOMA", ["RG", "IS", "SN"], null, 2026, 2033, [55, 65]],
    ["vII", "vII", "SOMA", ["RG", "IS"], "BEM", 2026, 2033, [55]],
    ["vIS", "vIS", "SOMA", ["RG", "SN"], null, 2027, 2033, [55, 65]],
    ["vDesc", "vDesc", "SUBTRAI", ["RG", "IS", "SN"], null, 2026, 2033, [55, 65]],
    ["vPIS", "vPIS", "SUBTRAI", ["RG", "IS"], null, 2026, 2026, [55, 65]],
    ["vCOFINS", "vCOFINS", "SUBTRAI", ["RG", "IS"], null, 2026, 2026, [55, 65]],
    ["vICMS", "vICMS", "SUBTRAI", ["RG", "IS"], "BEM", 2026, 2032, [55, 65]],
    ["vICMSUFDest", "vICMSUFDest", "SUBTRAI", ["RG", "IS"], "BEM", 2026, 2032, [55]],
    ["vFCP", "vFCP", "SUBTRAI", ["RG", "IS"], "BEM", 2026, 2032, [55, 65]],
    ["vFCPUFDest", "vFCPUFDest", "SUBTRAI", ["RG", "IS"], "BEM", 2026, 2032, [55]],
    ["vICMSMono", "vICMSMono", "SUBTRAI", ["RG", "IS"], "BEM", 2026, 2032, [55, 65]],
    ["vISSQN", "vISSQN", "SUBTRAI", ["RG", "IS"], "SERVICO", 2026, 2032, [55, 65]],
  ];

  static readonly TODOS: ElementoBaseCalculo[] = ElementoBaseCalculo.defs.map(
    (d) => new ElementoBaseCalculo(d[0], d[1], d[2], new Set(d[3]), d[4], d[5], d[6], new Set(d[7])),
  );

  campoCompoeBase(ano: number, natureza: BaseCalculoNatureza | null, tipoDoc: number): boolean {
    const anoOk = ano >= this.anoInicio && ano <= this.anoFim;
    const naturezaOk = this.natureza === null || (natureza !== null && this.natureza === natureza);
    const modeloOk = this.tiposDoc.has(tipoDoc);
    return anoOk && naturezaOk && modeloOk;
  }

  motivoNaoComposicao(ano: number, natureza: BaseCalculoNatureza | null, tipoDoc: number): string | null {
    const anoOk = ano >= this.anoInicio && ano <= this.anoFim;
    if (!anoOk) {
      return `Campo ${this.tag} não compõe as bases para o ano ${ano} (vigência ${this.anoInicio}–${this.anoFim}) e foi ignorado no cálculo`;
    }
    const naturezaOk = this.natureza === null || (natureza !== null && this.natureza === natureza);
    if (!naturezaOk) {
      return `Campo ${this.tag} não compõe as bases para a natureza ${natureza} (aplicável apenas a ${this.natureza}) e foi ignorado no cálculo`;
    }
    const modeloOk = this.tiposDoc.has(tipoDoc);
    if (!modeloOk) {
      return `Campo ${this.tag} não compõe as bases para o documento modelo ${tipoDoc} e foi ignorado no cálculo`;
    }
    return null;
  }

  aplicaBase(b: BaseCalculoBase): boolean {
    return this.bases.has(b);
  }
}

// ─── Modelos internos do cálculo ─────────────────────────────────────────────

export class AliquotaImpostoSeletivoModel {
  constructor(
    readonly aliquotaAdValorem: JBD | null,
    readonly aliquotaAdRem: JBD | null,
    readonly unidadeMedida: string | null,
  ) {}
}

export interface ClassificacaoTributariaDTO {
  id: number;
  codigo: string;
  nomenclatura: string | null;
  cst: string;
}

export interface ClassificacaoTributariaCalculoDTO {
  id: number;
  codigo: string;
  tipoAliquota: string | null;
  inGrupoMonofasiaPadrao: 0 | 1 | null;
  inGrupoMonofasiaReten: 0 | 1 | null;
  inGrupoMonofasiaRet: 0 | 1 | null;
  inGrupoMonofasiaDiferimento: 0 | 1 | null;
  inGrupoReducao: 0 | 1 | null;
}

export interface TratamentoClassificacaoDTO {
  idTratamentoTributario: number;
  idClassificacaoTributaria: number;
  inIncompativelComSuspensao: 0 | 1;
  inExigeGrupoDesoneracao: 0 | 1;
}

export interface TratamentoTributario {
  id: number;
  descricao: string;
  expressaoAliquota: string | null;
  expressaoAliquotaEfetiva: string | null;
  expressaoBaseCalculo: string | null;
  expressaoTributoCalculado: string | null;
  expressaoTributoDevido: string | null;
  expressaoPercentualDiferimento: string | null;
  expressaoValorDiferimento: string | null;
  inIncompativelComSuspensao: 0 | 1;
  inExigeGrupoDesoneracao: 0 | 1;
  inPossuiPercentualReducao: 0 | 1;
  inPossuiAjuste: 0 | 1;
  inPossuiRedutor: 0 | 1;
  inPossuiMonofasia: 0 | 1;
  inicioVigencia: string;
  fimVigencia: string | null;
}

export interface SituacaoTributaria {
  id: number;
  codigo: string | null;
  descricao: string | null;
  inGrupoIbsCbs: 0 | 1 | null;
  inGrupoIbsCbsMono: 0 | 1 | null;
  inGrupoReducao: 0 | 1 | null;
  inGrupoDiferimento: 0 | 1 | null;
}

export interface TipoDfe {
  id: number;
  tipo: number;
  sigla: string;
  descricao: string;
}

export interface AliquotaAdValoremDTO {
  valor: JBD;
}

export interface AliquotaAdRemDTO {
  valor: JBD;
  unidadeMedida: string;
}

export interface FundamentacaoClassificacaoDTO {
  textoCurto: string | null;
  memoriaCalculo: string | null;
}

export class OperacaoModel {
  constructor(
    readonly data: string,
    readonly codigoMunicipio: number,
    readonly codigoUf: number,
    readonly ncm: string | null,
    readonly nbs: string | null,
    readonly tpEnteGov: TipoEnteGovernamental | null,
    readonly pRedutor: JBD,
    readonly item: ItemOperacaoInput,
    readonly tratamentoClassificacao: TratamentoClassificacaoModel,
  ) {}
}

export class TratamentoClassificacaoModel {
  constructor(
    readonly tratamentoClassificacaoCbsIbs: TratamentoClassificacaoDTO | null,
    readonly tratamentoClassificacaoImpostoSeletivo: TratamentoClassificacaoDTO | null,
    readonly tratamentoClassificacaoCbsIbsDesoneracao: TratamentoClassificacaoDTO | null,
    readonly aliquotaImpostoSeletivo: AliquotaImpostoSeletivoModel | null,
    readonly temDesoneracao: boolean,
  ) {}
}

// ─── Saída ROC ───────────────────────────────────────────────────────────────

export interface DiferimentoDomain {
  pDif: JBD;
  vDif: JBD;
}
export interface ReducaoAliquotaDomain {
  pRedAliq: JBD | null;
  pAliqEfet: JBD | null;
}
export interface DevolucaoTributosDomain {
  pDevTrib: JBD;
  vDevTrib: JBD;
}
export interface EstornoCreditoDomain {
  vIBSEstCred: JBD | null;
  vCBSEstCred: JBD | null;
}
export interface IBSCBSCreditoPresumidoDomain {
  vCredPres: JBD | null;
  vCredPresCondSus: JBD | null;
}
export interface AjusteCompetenciaDomain {
  competApur: string | null;
  vIBS: JBD | null;
  vCBS: JBD | null;
}
export interface TransferenciaCreditoDomain {
  vIBS: JBD;
  vCBS: JBD;
}
export interface CreditoPresumidoOperacaoDomain {
  vBCCredPres: JBD | null;
  cCredPres: number | null;
  gIBSCredPres: IBSCBSCreditoPresumidoDomain | null;
  gCBSCredPres: IBSCBSCreditoPresumidoDomain | null;
}
export interface CreditoPresumidoIBSZFMDomain {
  pCredPresZFM: JBD | null;
}

export class CBSDomain {
  pCBS: JBD = JBD.ZERO;
  gDif: DiferimentoDomain | null = null;
  gDevTrib: DevolucaoTributosDomain | null = null;
  gRed: ReducaoAliquotaDomain | null = null;
  vCBS: JBD = JBD.ZERO;
  memoriaCalculo: string | null = null;

  getVDif(): JBD {
    return this.gDif !== null ? this.gDif.vDif : JBD.ZERO;
  }
  getVDevTrib(): JBD {
    return this.gDevTrib !== null ? this.gDevTrib.vDevTrib : JBD.ZERO;
  }
}

export class IBSUFDomain {
  pIBSUF: JBD = JBD.ZERO;
  gDif: DiferimentoDomain | null = null;
  gDevTrib: DevolucaoTributosDomain | null = null;
  gRed: ReducaoAliquotaDomain | null = null;
  vIBSUF: JBD = JBD.ZERO;
  memoriaCalculo: string | null = null;

  getVDif(): JBD {
    return this.gDif !== null ? this.gDif.vDif : JBD.ZERO;
  }
  getVDevTrib(): JBD {
    return this.gDevTrib !== null ? this.gDevTrib.vDevTrib : JBD.ZERO;
  }
}

export class IBSMunDomain {
  pIBSMun: JBD = JBD.ZERO;
  gDif: DiferimentoDomain | null = null;
  gDevTrib: DevolucaoTributosDomain | null = null;
  gRed: ReducaoAliquotaDomain | null = null;
  vIBSMun: JBD = JBD.ZERO;
  memoriaCalculo: string | null = null;

  getVDif(): JBD {
    return this.gDif !== null ? this.gDif.vDif : JBD.ZERO;
  }
  getVDevTrib(): JBD {
    return this.gDevTrib !== null ? this.gDevTrib.vDevTrib : JBD.ZERO;
  }
}

export interface ImpostoSeletivoDomain {
  CSTIS: string | null;
  cClassTribIS: string | null;
  vBCIS: JBD;
  pIS: JBD | null;
  pISEspec: JBD | null;
  adRemIS: JBD | null;
  uTrib: string | null;
  qTrib: JBD | null;
  vIS: JBD | null;
  memoriaCalculo: string | null;
}

export class TributacaoRegularDomain {
  CSTReg: string | null = null;
  cClassTribReg: string | null = null;
  pAliqEfetRegIBSUF: JBD = JBD.ZERO;
  vTribRegIBSUF: JBD = JBD.ZERO;
  pAliqEfetRegIBSMun: JBD = JBD.ZERO;
  vTribRegIBSMun: JBD = JBD.ZERO;
  pAliqEfetRegCBS: JBD = JBD.ZERO;
  vTribRegCBS: JBD = JBD.ZERO;
}

export class TributacaoCompraGovernamentalDomain {
  /** @Builder.Default ZERO no original Lombok */
  pAliqIBSUF: JBD = JBD.ZERO;
  vTribIBSUF: JBD = JBD.ZERO;
  pAliqIBSMun: JBD = JBD.ZERO;
  vTribIBSMun: JBD = JBD.ZERO;
  pAliqCBS: JBD = JBD.ZERO;
  vTribCBS: JBD = JBD.ZERO;

  /**
   * Rateio entre entes pós-2027 (porte fiel de getValoresEfetivos):
   * antes de 2027 cada ente fica com os seus valores; a partir de 2027,
   * União absorve tudo; Estado/Município absorve o IBS do outro + fração da
   * CBS conforme o percentual de transferência.
   */
  getValoresEfetivos(
    tpEnteGov: TipoEnteGovernamental | null,
    pTransferenciaCBS: JBD,
    dataFatoGerador: string,
  ): TributacaoCompraGovernamentalDomain | null {
    if (tpEnteGov === null) return null;
    if (dataFatoGerador < "2027-01-01") return this;

    if (tpEnteGov === TipoEnteGovernamental.UNIAO) {
      const b = new TributacaoCompraGovernamentalDomain();
      b.pAliqCBS = (this.pAliqCBS ?? JBD.ZERO).add(this.pAliqIBSUF ?? JBD.ZERO).add(this.pAliqIBSMun ?? JBD.ZERO);
      b.vTribCBS = (this.vTribCBS ?? JBD.ZERO).add(this.vTribIBSUF ?? JBD.ZERO).add(this.vTribIBSMun ?? JBD.ZERO);
      return b;
    }

    const pTransfDecimal = (pTransferenciaCBS ?? JBD.ZERO).divide(JBD.CEM, 8);
    const pAliqCBSTransferir = (this.pAliqCBS ?? JBD.ZERO).multiply(pTransfDecimal);
    const vTribCBSTransferir = (this.vTribCBS ?? JBD.ZERO).multiply(pTransfDecimal);
    const pAliqCBSFinal = (this.pAliqCBS ?? JBD.ZERO).subtract(pAliqCBSTransferir);
    const vTribCBSFinal = (this.vTribCBS ?? JBD.ZERO).subtract(vTribCBSTransferir);
    const pcAliquotaFinal = pAliqCBSTransferir.add(this.pAliqIBSUF ?? JBD.ZERO).add(this.pAliqIBSMun ?? JBD.ZERO);
    const valorFinal = vTribCBSTransferir.add(this.vTribIBSUF ?? JBD.ZERO).add(this.vTribIBSMun ?? JBD.ZERO);

    const b = new TributacaoCompraGovernamentalDomain();
    b.pAliqCBS = pAliqCBSFinal;
    b.vTribCBS = vTribCBSFinal;
    // PARITY: tipoEnteEquivalente() do enum original — DF equivale a ESTADO;
    // Consórcio Público e Comitê Gestor do IBS equivalem a MUNICÍPIO
    const equivaleEstado =
      tpEnteGov === TipoEnteGovernamental.ESTADO || tpEnteGov === TipoEnteGovernamental.DISTRITO_FEDERAL;
    const equivaleMunicipio =
      tpEnteGov === TipoEnteGovernamental.MUNICIPIO ||
      tpEnteGov === TipoEnteGovernamental.CONSORCIO_PUBLICO ||
      tpEnteGov === TipoEnteGovernamental.COMITE_GESTOR_IBS;
    if (equivaleEstado) {
      b.pAliqIBSUF = pcAliquotaFinal;
      b.vTribIBSUF = valorFinal;
    } else if (equivaleMunicipio) {
      b.pAliqIBSMun = pcAliquotaFinal;
      b.vTribIBSMun = valorFinal;
    }
    return b;
  }

  zerarValores(): void {
    this.pAliqIBSUF = JBD.ZERO;
    this.vTribIBSUF = JBD.ZERO;
    this.pAliqIBSMun = JBD.ZERO;
    this.vTribIBSMun = JBD.ZERO;
    this.pAliqCBS = JBD.ZERO;
    this.vTribCBS = JBD.ZERO;
  }
}

export interface MonofasiaPadraoDomain {
  qBCMono: JBD;
  adRemIBS: JBD;
  adRemCBS: JBD;
  vIBSMono: JBD;
  vCBSMono: JBD;
}
export interface MonofasiaRetencaoDomain {
  qBCMonoReten: JBD;
  adRemIBSReten: JBD;
  vIBSMonoReten: JBD;
  adRemCBSReten: JBD;
  vCBSMonoReten: JBD;
}
export interface MonofasiaRetidoAnteriormenteDomain {
  qBCMonoRet: JBD;
  adRemIBSRet: JBD;
  vIBSMonoRet: JBD;
  adRemCBSRet: JBD;
  vCBSMonoRet: JBD;
}
export interface MonofasiaDiferimentoDomain {
  pDifIBS: JBD;
  vIBSMonoDif: JBD;
  pDifCBS: JBD;
  vCBSMonoDif: JBD;
}

export class MonofasiaDomain {
  gMonoPadrao: MonofasiaPadraoDomain | null = null;
  gMonoReten: MonofasiaRetencaoDomain | null = null;
  gMonoRet: MonofasiaRetidoAnteriormenteDomain | null = null;
  gMonoDif: MonofasiaDiferimentoDomain | null = null;
  vTotIBSMonoItem: JBD = JBD.ZERO;
  vTotCBSMonoItem: JBD = JBD.ZERO;

  getVIBSMono(): JBD {
    return this.gMonoPadrao !== null ? this.gMonoPadrao.vIBSMono : JBD.ZERO;
  }
  getVCBSMono(): JBD {
    return this.gMonoPadrao !== null ? this.gMonoPadrao.vCBSMono : JBD.ZERO;
  }
  getVIBSMonoReten(): JBD {
    return this.gMonoReten !== null ? this.gMonoReten.vIBSMonoReten : JBD.ZERO;
  }
  getVCBSMonoReten(): JBD {
    return this.gMonoReten !== null ? this.gMonoReten.vCBSMonoReten : JBD.ZERO;
  }
  getVIBSMonoRet(): JBD {
    return this.gMonoRet !== null ? this.gMonoRet.vIBSMonoRet : JBD.ZERO;
  }
  getVCBSMonoRet(): JBD {
    return this.gMonoRet !== null ? this.gMonoRet.vCBSMonoRet : JBD.ZERO;
  }
}

export class GrupoIBSCBSDomain {
  vBC: JBD | null = null;
  gIBSUF: IBSUFDomain | null = null;
  gIBSMun: IBSMunDomain | null = null;
  vIBS: JBD = JBD.ZERO;
  gCBS: CBSDomain | null = null;
  gTribRegular: TributacaoRegularDomain | null = null;
  gTribCompraGov: TributacaoCompraGovernamentalDomain | null = null;

  possuiBaseCalculoIBSCBS(): boolean {
    return this.vBC !== null;
  }
  getValorBaseCalculoIBSCBS(): JBD {
    return this.vBC ?? JBD.ZERO;
  }
  possuiCbs(): boolean {
    return this.gCBS !== null;
  }
  possuiIBSUF(): boolean {
    return this.gIBSUF !== null;
  }
  possuiIBSMun(): boolean {
    return this.gIBSMun !== null;
  }
}

export class IBSCBSDomain {
  CST: string | null = null;
  cClassTrib: string | null = null;
  indDoacao: number | null = null;
  gIBSCBS: GrupoIBSCBSDomain | null = null;
  gIBSCBSMono: MonofasiaDomain | null = null;
  gTransfCred: TransferenciaCreditoDomain | null = null;
  gAjusteCompet: AjusteCompetenciaDomain | null = null;
  gEstornoCred: EstornoCreditoDomain | null = null;
  gCredPresOper: CreditoPresumidoOperacaoDomain | null = null;
  gCredPresIBSZFM: CreditoPresumidoIBSZFMDomain | null = null;

  possuiBaseCalculoIBSCBS(): boolean {
    return this.gIBSCBS !== null && this.gIBSCBS.possuiBaseCalculoIBSCBS();
  }
  getValorBaseCalculoIBSCBS(): JBD {
    return this.possuiBaseCalculoIBSCBS() ? this.gIBSCBS!.getValorBaseCalculoIBSCBS() : JBD.ZERO;
  }
  possuiCbs(): boolean {
    return this.gIBSCBS !== null && this.gIBSCBS.possuiCbs();
  }
  getGCBS(): CBSDomain | null {
    return this.gIBSCBS !== null ? this.gIBSCBS.gCBS : null;
  }
  possuiIBSUF(): boolean {
    return this.gIBSCBS !== null && this.gIBSCBS.possuiIBSUF();
  }
  getGIBSUF(): IBSUFDomain | null {
    return this.gIBSCBS !== null ? this.gIBSCBS.gIBSUF : null;
  }
  possuiIBSMun(): boolean {
    return this.gIBSCBS !== null && this.gIBSCBS.possuiIBSMun();
  }
  getGIBSMun(): IBSMunDomain | null {
    return this.gIBSCBS !== null ? this.gIBSCBS.gIBSMun : null;
  }
  possuiMonofasia(): boolean {
    return this.gIBSCBSMono !== null;
  }
  getGIBSCBSMono(): MonofasiaDomain | null {
    return this.possuiMonofasia() ? this.gIBSCBSMono : null;
  }
  possuiTributacaoRegular(): boolean {
    return this.gIBSCBS !== null && this.gIBSCBS.gTribRegular !== null;
  }
  possuiEstornoCredito(): boolean {
    return this.gEstornoCred !== null;
  }
  getGEstornoCred(): EstornoCreditoDomain | null {
    return this.gEstornoCred;
  }
}

export class TributosDomain {
  IS: ImpostoSeletivoDomain | null = null;
  IBSCBS: IBSCBSDomain | null = null;

  possuiImpostoSeletivo(): boolean {
    return this.IS !== null;
  }
  getValorImpostoSeletivo(): JBD {
    return this.possuiImpostoSeletivo() ? (this.IS!.vIS ?? JBD.ZERO) : JBD.ZERO;
  }
  possuiBaseCalculoIBSCBS(): boolean {
    return this.IBSCBS !== null && this.IBSCBS.possuiBaseCalculoIBSCBS();
  }
  getValorBaseCalculoIBSCBS(): JBD {
    return this.possuiBaseCalculoIBSCBS() ? this.IBSCBS!.getValorBaseCalculoIBSCBS() : JBD.ZERO;
  }
  possuiCbs(): boolean {
    return this.IBSCBS !== null && this.IBSCBS.possuiCbs();
  }
  getGCBS(): CBSDomain | null {
    return this.IBSCBS !== null ? this.IBSCBS.getGCBS() : null;
  }
  possuiCredPresCbs(): boolean {
    return false;
  }
  getCredPresCbs(): IBSCBSCreditoPresumidoDomain | null {
    return null;
  }
  possuiIBSUF(): boolean {
    return this.IBSCBS !== null && this.IBSCBS.possuiIBSUF();
  }
  getGIBSUF(): IBSUFDomain | null {
    return this.IBSCBS !== null ? this.IBSCBS.getGIBSUF() : null;
  }
  possuiIBSMun(): boolean {
    return this.IBSCBS !== null && this.IBSCBS.possuiIBSMun();
  }
  getGIBSMun(): IBSMunDomain | null {
    return this.IBSCBS !== null ? this.IBSCBS.getGIBSMun() : null;
  }
  possuiMonofasia(): boolean {
    return this.IBSCBS !== null && this.IBSCBS.possuiMonofasia();
  }
  getGIBSCBSMono(): MonofasiaDomain | null {
    return this.possuiMonofasia() ? this.IBSCBS!.getGIBSCBSMono() : null;
  }
  possuiEstornoCredito(): boolean {
    return this.IBSCBS !== null && this.IBSCBS.possuiEstornoCredito();
  }
  possuiTributacaoRegular(): boolean {
    return this.IBSCBS !== null && this.IBSCBS.possuiTributacaoRegular();
  }
  getGEstornoCred(): import("./types.js").EstornoCreditoDomain | null {
    return this.possuiEstornoCredito() ? this.IBSCBS!.getGEstornoCred() : null;
  }
}

export class ObjetoDomain {
  constructor(
    readonly nObj: number,
    readonly tribCalc: TributosDomain | null,
    readonly calculoSimulado: boolean,
  ) {}

  getImpostoSeletivo(): ImpostoSeletivoDomain | null {
    return this.tribCalc !== null ? this.tribCalc.IS : null;
  }
  getValorImpostoSeletivo(): JBD {
    return this.possuiImpostoSeletivo() ? this.tribCalc!.getValorImpostoSeletivo() : JBD.ZERO;
  }
  possuiImpostoSeletivo(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiImpostoSeletivo();
  }
  possuiBaseCalculoIBSCBS(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiBaseCalculoIBSCBS();
  }
  getValorBaseCalculoIBSCBS(): JBD {
    return this.possuiBaseCalculoIBSCBS() ? this.tribCalc!.getValorBaseCalculoIBSCBS() : JBD.ZERO;
  }
  possuiCbs(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiCbs();
  }
  getGCBS(): CBSDomain | null {
    return this.tribCalc !== null ? this.tribCalc.getGCBS() : null;
  }
  possuiCredPresCbs(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiCredPresCbs();
  }
  getCredPresCbs(): IBSCBSCreditoPresumidoDomain | null {
    return this.possuiCredPresCbs() ? this.tribCalc!.getCredPresCbs() : null;
  }
  possuiIBSUF(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiIBSUF();
  }
  getGIBSUF(): IBSUFDomain | null {
    return this.tribCalc !== null ? this.tribCalc.getGIBSUF() : null;
  }
  possuiIBSMun(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiIBSMun();
  }
  getGIBSMun(): IBSMunDomain | null {
    return this.tribCalc !== null ? this.tribCalc.getGIBSMun() : null;
  }
  possuiMonofasia(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiMonofasia();
  }
  getGIBSCBSMono(): MonofasiaDomain | null {
    return this.possuiMonofasia() ? this.tribCalc!.getGIBSCBSMono() : null;
  }
  possuiTributacaoRegular(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiTributacaoRegular();
  }
  possuiEstornoCredito(): boolean {
    return this.tribCalc !== null && this.tribCalc.possuiEstornoCredito();
  }
  getGEstornoCred(): EstornoCreditoDomain | null {
    return this.possuiEstornoCredito() ? this.tribCalc!.getGEstornoCred() : null;
  }
}

export interface ImpostoSeletivoTotalDomain {
  vIS: JBD;
}
export interface IBSUFTotalDomain {
  vDif: JBD;
  vDevTrib: JBD;
  vIBSUF: JBD;
}
export interface IBSMunTotalDomain {
  vDif: JBD;
  vDevTrib: JBD;
  vIBSMun: JBD;
}
export interface IBSTotalDomain {
  gIBSUF: IBSUFTotalDomain | null;
  gIBSMun: IBSMunTotalDomain | null;
  vIBS: JBD | null;
  vCredPres: JBD | null;
  vCredPresCondSus: JBD | null;
}
export interface CBSTotalDomain {
  vDif: JBD;
  vDevTrib: JBD;
  vCBS: JBD;
  vCredPres: JBD;
  vCredPresCondSus: JBD;
}
export interface MonofasiaTotalDomain {
  vIBSMono: JBD;
  vCBSMono: JBD;
  vIBSMonoReten: JBD;
  vCBSMonoReten: JBD;
  vIBSMonoRet: JBD;
  vCBSMonoRet: JBD;
}
export interface IBSCBSTotalDomain {
  vBCIBSCBS: JBD | null;
  gIBS: IBSTotalDomain | null;
  gCBS: CBSTotalDomain | null;
  gMono: MonofasiaTotalDomain | null;
  gEstornoCred: EstornoCreditoDomain | null;
}
export interface TributosTotaisDomain {
  ISTot: ImpostoSeletivoTotalDomain | null;
  IBSCBSTot: IBSCBSTotalDomain | null;
}
export interface ValoresTotaisDomain {
  tribCalc: TributosTotaisDomain | null;
}

export class CompraGovernamentalDomain {
  constructor(
    readonly tpEnteGov: TipoEnteGovernamental | null,
    readonly pRedutor: JBD,
    readonly tpOperGov: TipoOperacaoGovernamental | null,
  ) {}
}
export interface OperacaoConsumoDomain {
  gCompraGov: CompraGovernamentalDomain;
}

export class ROCDomain {
  constructor(
    readonly oper: OperacaoConsumoDomain | null,
    readonly objetos: ObjetoDomain[],
    readonly total: ValoresTotaisDomain | null,
  ) {}
}

// ─── Saída interna CbsIbsOutput (port de api/model/output) ──────────────────

export class TributacaoRegularOutput {
  constructor(
    public cst: string | null,
    public cClassTrib: string | null,
    public baseCalculo: JBD | null,
    public aliquotaEfetiva: JBD | null,
    public tributoDevido: JBD | null,
  ) {}
}

export interface GrupoEtapaMonofasiaOutput {
  quantidade: JBD | null;
  aliquotaAdRem: JBD | null;
  valor: JBD | null;
}

export interface GrupoDiferimentoMonofasiaOutput {
  percentualDiferimento: JBD | null;
  valorDiferimento: JBD | null;
}

export class GrupoMonofasiaOutput {
  constructor(
    readonly tributoMonofasico: GrupoEtapaMonofasiaOutput | null,
    readonly tributoSujeitoRetencao: GrupoEtapaMonofasiaOutput | null,
    readonly tributoRetido: GrupoEtapaMonofasiaOutput | null,
    readonly tributoDiferido: GrupoDiferimentoMonofasiaOutput | null,
  ) {}
}

export class CbsIbsOutput {
  aliquota: JBD | null = null;
  baseCalculo: JBD | null = null;
  quantidade: JBD | null = null;
  tributoCalculado: JBD | null = null;
  tributoDevido: JBD | null = null;
  grupoReducao: ReducaoAliquotaDomain | null = null;
  tributacaoRegular: TributacaoRegularOutput | null = null;
  compraGovernamental: TributacaoCompraGovernamentalDomain | null = null;
  grupoDiferimento: DiferimentoDomain | null = null;
  grupoMonofasia: GrupoMonofasiaOutput | null = null;
  memoriaCalculo: string | null = null;

  possuiCompraGov(): boolean {
    return this.compraGovernamental !== null;
  }
}

// ─── Base de cálculo unificada (saída) ───────────────────────────────────────

export class BaseCalculoUnificadaOutput {
  constructor(
    readonly baseRG: JBD,
    readonly baseIS: JBD,
    readonly baseSN: JBD,
    readonly avisos: string[],
  ) {}
}
