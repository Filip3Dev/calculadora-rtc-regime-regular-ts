/**
 * Serviços de suporte — porte fiel dos serviços finos do domínio Java
 * (UfService, MunicipioService, SituacaoTributariaService, ...,
 * MemoriaCalculoService com TokenizerService).
 */
import type { Repositories } from "../db/repositories.js";
import { JBD } from "../model/jbd.js";
import {
  AliquotaImpostoSeletivoNaoInformadaException,
  AliquotaNaoEncontradaException,
  AliquotaReferenciaNaoEncontradaException,
  ClassificacaoTributariaNaoEncontradaException,
  ClassificacaoTributariaNaoVinculadaSituacaoTributariaException,
  ClassificacaoTributariaNaoVinculadaTipoDfeException,
  DataFatoGeradorNaoInformadaException,
  ErroFaltaImplementacaoException,
  ErroGenericoValidacaoException,
  FundamentacaoClassificacaoNaoEncontradaException,
  ImpostoSeletivoNaoInformadoException,
  IncompatibilidadeSuspensaoException,
  MunicipioNaoEncontradoException,
  MunicipioNaoPertencenteException,
  NbsCompletoNaoInformadoException,
  NbsNaoEncontradaException,
  NbsNaoVinculadaException,
  NcmCompletoNaoInformadoException,
  NcmNaoEncontradaException,
  NcmNaoVinculadaException,
  NcmNbsSimultaneasException,
  NomenclaturaIncompativelTipoDfeException,
  NomenclaturaObrigatoriaNaoInformadaException,
  PercentualReducaoNaoEncontradoException,
  SituacaoTributariaNaoEncontradaException,
  TipoDfeNaoEncontradoException,
  TratamentoClassificacaoNaoEncontradoException,
  TributacaoRegularNaoInformadaException,
  UfNaoEncontradaException,
} from "../errors.js";
import {
  ehTrioRigido,
  impostoSeletivoAplicavel,
  normalizarSigla,
  semTratamentoCalculadora,
  type CbsIbsOutput,
  type ClassificacaoTributariaCalculoDTO,
  type ClassificacaoTributariaDTO,
  type ImpostoSeletivoDomain,
  type SituacaoTributaria,
  type TipoDfe,
  type TratamentoClassificacaoDTO,
  type TratamentoTributario,
  Tributo,
} from "../model/types.js";

const isBlank = (s: string | null | undefined): boolean => s === null || s === undefined || s.trim() === "";
const isNotBlank = (s: string | null | undefined): boolean => !isBlank(s);

export class UfService {
  constructor(private readonly repo: Repositories) {}
  buscar(sigla: string): number {
    const codigo = this.repo.consultarCodigoUf(sigla);
    if (codigo === null) throw new UfNaoEncontradaException(sigla);
    return codigo;
  }
  validarUf(sigla: string): void {
    if (!this.repo.existeUf(sigla)) throw new UfNaoEncontradaException(sigla);
  }
}

export class MunicipioService {
  constructor(private readonly repo: Repositories) {}
  validarMunicipio(codigoMunicipio: number, siglaUf: string): void {
    const resultado = this.repo.validarMunicipio(codigoMunicipio, siglaUf);
    if (resultado === 1) throw new MunicipioNaoEncontradoException(codigoMunicipio);
    if (resultado === 2) throw new MunicipioNaoPertencenteException(codigoMunicipio, siglaUf);
  }
  buscarUfPorMunicipio(codigoMunicipio: number): string {
    return this.repo.siglaUfPorMunicipio(codigoMunicipio);
  }
}

export class SituacaoTributariaService {
  constructor(private readonly repo: Repositories) {}
  validarCst(cst: string, idTributo: number, data: string): void {
    if (!this.repo.existeCst(cst, idTributo, data)) {
      const tributo = idTributo === Tributo.IS ? "Imposto Seletivo" : "CBS e IBS";
      throw new SituacaoTributariaNaoEncontradaException(cst, data, tributo);
    }
  }
  consultarSituacaoTributariaPorCodigo(cst: string, idTributo: number, data: string): SituacaoTributaria | null {
    return this.repo.consultarSituacaoTributariaPorCodigo(cst, idTributo, data);
  }
}

export class ClassificacaoTributariaService {
  constructor(private readonly repo: Repositories) {}
  buscarClassificacaoTributariaCbsIbs(codigo: string, data: string): ClassificacaoTributariaDTO {
    return this.buscar(codigo, Tributo.CBS, data, "CBS e IBS");
  }
  buscarClassificacaoTributariaImpostoSeletivo(codigo: string, data: string): ClassificacaoTributariaDTO {
    return this.buscar(codigo, Tributo.IS, data, "Imposto Seletivo");
  }
  private buscar(codigo: string, idTributo: number, data: string, tipo: string): ClassificacaoTributariaDTO {
    const c = this.repo.buscarClassificacaoTributaria(codigo, idTributo, data);
    if (c === null) throw new ClassificacaoTributariaNaoEncontradaException(codigo, data, tipo);
    return c;
  }
  buscarClassificacaoTributariaCalculo(id: number): ClassificacaoTributariaCalculoDTO {
    const c = this.repo.buscarClassificacaoTributariaCalculo(id);
    if (c === null) throw new ClassificacaoTributariaNaoEncontradaException(id);
    return c;
  }
}

export class TratamentoClassificacaoService {
  constructor(private readonly repo: Repositories) {}
  buscarTratamentoClassificacao(idClassificacaoTributaria: number, data: string): TratamentoClassificacaoDTO {
    const t = this.repo.buscarTratamentoClassificacao(idClassificacaoTributaria, data);
    if (t === null) throw new TratamentoClassificacaoNaoEncontradoException(idClassificacaoTributaria, data);
    return t;
  }
}

export class TratamentoTributarioService {
  constructor(private readonly repo: Repositories) {}
  buscar(id: number): TratamentoTributario {
    return this.repo.buscarTratamentoTributario(id);
  }
}

export class AliquotaPadraoService {
  constructor(private readonly repo: Repositories) {}
  buscarAliquota(idTributo: number, codigoUf: number | null, municipio: number | null, data: string) {
    const a = this.repo.buscarAliquotaResultado(idTributo, codigoUf, municipio, data);
    if (a === null) throw new AliquotaNaoEncontradaException(idTributo, codigoUf, municipio, data);
    return a;
  }
}

export class AliquotaReferenciaService {
  constructor(private readonly repo: Repositories) {}
  buscar(idTributo: number, data: string): JBD {
    const a = this.repo.buscarAliquotaReferencia(idTributo, data);
    return a;
  }
}

export class PercentualReducaoService {
  constructor(private readonly repo: Repositories) {}
  buscar(idClassificacaoTributaria: number, idTributo: number, data: string): JBD {
    const p = this.repo.buscarPercentualReducao(idClassificacaoTributaria, idTributo, data);
    if (p === null) throw new PercentualReducaoNaoEncontradoException(idClassificacaoTributaria, data);
    return p;
  }
}

export class RedutorCompraGovernamentalService {
  constructor(private readonly repo: Repositories) {}
  buscarValorRedutor(tpEnteGov: number | null, data: string): JBD {
    if (tpEnteGov === null) return JBD.ZERO;
    const v = this.repo.buscarValorRedutorCompraGov(data);
    if (v === null) throw new Error("Redutor de compra governamental não encontrada.");
    return v;
  }
}

export class TransferenciaCBSService {
  constructor(private readonly repo: Repositories) {}
  getPercentualTransferencia(data: string): JBD {
    const v = this.repo.getPercentualTransferenciaCBS(data);
    if (v === null) {
      throw new Error("Percentual de transferência de CBS para ente federativo não encontrada.");
    }
    return v;
  }
}

export class TipoDfeService {
  constructor(private readonly repo: Repositories) {}
  buscarPorTipo(tpDoc: number | null, data: string): TipoDfe | null {
    if (tpDoc === null) return null;
    const tipoDfe = this.repo.buscarTipoDfePorTipo(tpDoc, data);
    if (tipoDfe === null) throw new TipoDfeNaoEncontradoException(tpDoc, data);
    if (semTratamentoCalculadora(tipoDfe.sigla)) {
      throw new ErroFaltaImplementacaoException(
        "Tipo de documento fiscal (tpDoc) de código %d (%s) não possui tratamento implementado na Calculadora",
        tpDoc,
        tipoDfe.sigla,
      );
    }
    return tipoDfe;
  }
}

export class TipoDfeClassificacaoService {
  constructor(private readonly repo: Repositories) {}
  buscar(idClassificacaoTributaria: number, data: string): number[] {
    return this.repo.tiposDfeVinculados(idClassificacaoTributaria, data);
  }
  validarVinculo(tipoDfe: TipoDfe, idClassificacaoTributaria: number, cClassTrib: string, data: string, tributos: string): void {
    const vinculados = this.repo.tiposDfeVinculados(idClassificacaoTributaria, data);
    if (!vinculados.includes(tipoDfe.id)) {
      throw new ClassificacaoTributariaNaoVinculadaTipoDfeException(cClassTrib, tipoDfe.tipo, tributos);
    }
  }
}

export class NcmService {
  constructor(private readonly repo: Repositories) {}
  existeNcm(ncm: string, data: string): boolean {
    return this.repo.existeNcm(ncm, data);
  }
}

export class NbsService {
  constructor(private readonly repo: Repositories) {}
  existeNbs(nbs: string, data: string): boolean {
    return this.repo.existeNbs(nbs, data);
  }
}

export class NcmAplicavelService {
  constructor(private readonly repo: Repositories) {}
  validarNcmAplicavel(ncm: string | null, idClassificacaoTributaria: number, codigoClassificacaoTributaria: string, data: string, tributos: string): boolean {
    const possuiNcmCompleto = (ncm ?? "").length === 8;
    const temClassificacao = this.repo.temNcmAplicavel(idClassificacaoTributaria, data);
    if (temClassificacao && !possuiNcmCompleto) throw new NcmCompletoNaoInformadoException();
    if (possuiNcmCompleto) {
      this.criticar(ncm!, idClassificacaoTributaria, codigoClassificacaoTributaria, data, tributos, temClassificacao);
    }
    return true;
  }
  criticarNcmContraAnexo(ncm: string, idClassificacaoTributaria: number, codigoClassificacaoTributaria: string, data: string, tributos: string): void {
    this.criticar(ncm, idClassificacaoTributaria, codigoClassificacaoTributaria, data, tributos, this.repo.temNcmAplicavel(idClassificacaoTributaria, data));
  }
  private criticar(ncm: string, idClassificacaoTributaria: number, codigo: string, data: string, tributos: string, temClassificacao: boolean): void {
    if (!temClassificacao) return;
    if (!this.repo.temNcmAplicavelPara(ncm, idClassificacaoTributaria, data)) {
      throw new NcmNaoVinculadaException(ncm, codigo, tributos);
    }
    if (
      this.repo.temExcecaoNcmAplicavelAtiva(ncm, idClassificacaoTributaria, data) &&
      !this.repo.temNcmAplicavelSemExcecao(ncm, idClassificacaoTributaria, data)
    ) {
      throw new NcmNaoVinculadaException(ncm, codigo, tributos);
    }
  }
}

export class NbsAplicavelService {
  constructor(private readonly repo: Repositories) {}
  validarNbsAplicavel(nbs: string | null, idClassificacaoTributaria: number, codigoClassificacaoTributaria: string, data: string, tributos: string): boolean {
    const possuiNbsCompleto = (nbs ?? "").length === 9;
    const temClassificacao = this.repo.temNbsAplicavel(idClassificacaoTributaria, data);
    if (temClassificacao && !possuiNbsCompleto) throw new NbsCompletoNaoInformadoException();
    if (possuiNbsCompleto) {
      this.criticar(nbs!, idClassificacaoTributaria, codigoClassificacaoTributaria, data, tributos, temClassificacao);
    }
    return true;
  }
  criticarNbsContraAnexo(nbs: string, idClassificacaoTributaria: number, codigoClassificacaoTributaria: string, data: string, tributos: string): void {
    this.criticar(nbs, idClassificacaoTributaria, codigoClassificacaoTributaria, data, tributos, this.repo.temNbsAplicavel(idClassificacaoTributaria, data));
  }
  private criticar(nbs: string, idClassificacaoTributaria: number, codigo: string, data: string, tributos: string, temClassificacao: boolean): void {
    if (!temClassificacao) return;
    if (!this.repo.temNbsAplicavelPara(nbs, idClassificacaoTributaria, data)) {
      throw new NbsNaoVinculadaException(nbs, codigo, tributos);
    }
    if (
      this.repo.temExcecaoNbsAplicavelAtiva(nbs, idClassificacaoTributaria, data) &&
      !this.repo.temNbsAplicavelSemExcecao(nbs, idClassificacaoTributaria, data)
    ) {
      throw new NbsNaoVinculadaException(nbs, codigo, tributos);
    }
  }
}

// ─── Nomenclatura (com tpDoc) ────────────────────────────────────────────────

export enum NomenclaturaResult {
  NCM = "NCM",
  NBS = "NBS",
  MISTO = "MISTO",
  SEM = "SEM",
  EXCECAO_NCM = "EXCECAO_NCM",
  EXCECAO_NBS = "EXCECAO_NBS",
}

const EXCEPTION_CLASSIFICACOES = new Set(["200038"]);

export class NomenclaturaService {
  constructor(
    private readonly repo: Repositories,
    private readonly classificacaoTributariaService: ClassificacaoTributariaService,
    private readonly tipoDfeClassificacaoService: TipoDfeClassificacaoService,
  ) {}

  determinarNomenclatura(siglaDfe: string, cClassTrib: string, data: string): NomenclaturaResult {
    const classificacao = this.classificacaoTributariaService.buscarClassificacaoTributariaCbsIbs(cClassTrib, data);
    const idClassificacao = classificacao.id;
    if (!this.siglaDfeCompativel(siglaDfe, idClassificacao, data)) {
      return NomenclaturaResult.SEM;
    }
    const ncmAplicavel = this.repo.temNcmAplicavel(idClassificacao, data);
    const nbsAplicavel = this.repo.temNbsAplicavel(idClassificacao, data);
    return this.determinarResultado(siglaDfe, cClassTrib, ncmAplicavel, nbsAplicavel);
  }

  private siglaDfeCompativel(siglaDfe: string, idClassificacao: number, data: string): boolean {
    const tipos = this.tipoDfeClassificacaoService.buscar(idClassificacao, data);
    const norm = normalizarSigla(siglaDfe);
    const siglas = this.repo.buscarTipoDfePorIds(tipos, data);
    return siglas.some((s) => normalizarSigla(s) === norm);
  }

  private determinarResultado(siglaDfe: string, cClassTrib: string, ncmAplicavel: boolean, nbsAplicavel: boolean): NomenclaturaResult {
    if (EXCEPTION_CLASSIFICACOES.has(cClassTrib)) {
      const norm = normalizarSigla(siglaDfe);
      if (norm === "nfe" || norm === "nfce") return NomenclaturaResult.EXCECAO_NCM;
      if (norm === "nfse") return NomenclaturaResult.EXCECAO_NBS;
      return NomenclaturaResult.SEM;
    }
    if (ncmAplicavel && nbsAplicavel) return NomenclaturaResult.MISTO;
    if (ncmAplicavel) return NomenclaturaResult.NCM;
    if (nbsAplicavel) return NomenclaturaResult.NBS;
    return NomenclaturaResult.SEM;
  }
}

export class ValidacaoNomenclaturaService {
  constructor(
    private readonly nomenclaturaService: NomenclaturaService,
    private readonly ncmAplicavelService: NcmAplicavelService,
    private readonly nbsAplicavelService: NbsAplicavelService,
  ) {}

  validar(siglaDfe: string, idClassificacaoTributaria: number, codigo: string, ncm: string | null, nbs: string | null, data: string, tributos: string, modoRigido: boolean): void {
    const resultado = this.nomenclaturaService.determinarNomenclatura(siglaDfe, codigo, data);
    switch (resultado) {
      case NomenclaturaResult.NCM:
      case NomenclaturaResult.EXCECAO_NCM:
        return this.exigirNcm(siglaDfe, idClassificacaoTributaria, codigo, ncm, nbs, data, tributos);
      case NomenclaturaResult.NBS:
      case NomenclaturaResult.EXCECAO_NBS:
        return this.exigirNbs(siglaDfe, idClassificacaoTributaria, codigo, ncm, nbs, data, tributos);
      case NomenclaturaResult.MISTO:
        return this.exigirNcmOuNbs(siglaDfe, idClassificacaoTributaria, codigo, ncm, nbs, data, tributos);
      case NomenclaturaResult.SEM:
        return this.validarSemExigencia(siglaDfe, idClassificacaoTributaria, codigo, ncm, nbs, data, tributos, modoRigido);
    }
  }

  private exigirNcm(siglaDfe: string, idCltr: number, codigo: string, ncm: string | null, nbs: string | null, data: string, tributos: string): void {
    if (isNotBlank(nbs)) {
      throw new NomenclaturaIncompativelTipoDfeException("NBS", codigo, siglaDfe);
    }
    if ((ncm ?? "").length !== 8) throw new NcmCompletoNaoInformadoException();
    this.ncmAplicavelService.criticarNcmContraAnexo(ncm!, idCltr, codigo, data, tributos);
  }

  private exigirNbs(siglaDfe: string, idCltr: number, codigo: string, ncm: string | null, nbs: string | null, data: string, tributos: string): void {
    if (isNotBlank(ncm)) {
      throw new NomenclaturaIncompativelTipoDfeException("NCM", codigo, siglaDfe);
    }
    if ((nbs ?? "").length !== 9) throw new NbsCompletoNaoInformadoException();
    this.nbsAplicavelService.criticarNbsContraAnexo(nbs!, idCltr, codigo, data, tributos);
  }

  private exigirNcmOuNbs(siglaDfe: string, idCltr: number, codigo: string, ncm: string | null, nbs: string | null, data: string, tributos: string): void {
    // simultânea já rejeitada antes
    if (isBlank(ncm) && isBlank(nbs)) {
      throw new NomenclaturaObrigatoriaNaoInformadaException(
        "Informar NCM ou NBS para a classificação tributária informada",
      );
    }
    if (isNotBlank(ncm)) this.ncmAplicavelService.criticarNcmContraAnexo(ncm!, idCltr, codigo, data, tributos);
    else this.nbsAplicavelService.criticarNbsContraAnexo(nbs!, idCltr, codigo, data, tributos);
  }

  private validarSemExigencia(siglaDfe: string, idCltr: number, codigo: string, ncm: string | null, nbs: string | null, data: string, tributos: string, modoRigido: boolean): void {
    if (!modoRigido || !ehTrioRigido(siglaDfe)) return; // PERMISSIVO: aceita
    if (isBlank(ncm) && isBlank(nbs)) {
      throw new NomenclaturaObrigatoriaNaoInformadaException(
        "Informar NCM ou NBS para a classificação tributária informada",
      );
    }
    if (isNotBlank(ncm)) this.ncmAplicavelService.criticarNcmContraAnexo(ncm!, idCltr, codigo, data, tributos);
    else this.nbsAplicavelService.criticarNbsContraAnexo(nbs!, idCltr, codigo, data, tributos);
  }
}

// ─── Alíquotas ad valorem/ad rem ─────────────────────────────────────────────

export class AliquotaAdValoremProdutoService {
  constructor(private readonly repo: Repositories) {}
  buscarAliquotaAdValorem(ncm: string, idTributo: number, data: string) {
    return this.repo.buscarAliquotaAdValoremProduto(ncm, idTributo, data);
  }
  existeNcmAdValorem(ncm: string, idTributo: number, data: string): boolean {
    return this.repo.existeNcmAdValorem(ncm, idTributo, data);
  }
}

export class AliquotaAdRemProdutoService {
  constructor(private readonly repo: Repositories) {}
  buscarAliquotaAdRem(ncm: string, idTributo: number, data: string) {
    return this.repo.buscarAliquotaAdRemProduto(ncm, idTributo, data);
  }
}

export class AliquotaAdValoremServicoService {
  constructor(private readonly repo: Repositories) {}
  buscarAliquotaAdValorem(nbs: string, idTributo: number, idCltr: number | null, data: string): JBD | null {
    return this.repo.buscarAliquotaAdValoremServico(nbs, idTributo, idCltr, data);
  }
  existeNbsAdValorem(nbs: string, idTributo: number, data: string): boolean {
    return this.repo.existeNbsAdValorem(nbs, idTributo, data);
  }
  buscarAliquotaAdValoremPorClassificacaoTributaria(idTributo: number, idCltr: number, data: string): JBD | null {
    return this.repo.buscarAliquotaAdValoremPorClassificacaoTributaria(idTributo, idCltr, data);
  }
}

// ─── Fundamentação + tokenizer + memória de cálculo ─────────────────────────

export class FundamentacaoClassificacaoService {
  constructor(private readonly repo: Repositories) {}
  buscar(idClassificacaoTributaria: number, data: string) {
    const f = this.repo.buscarFundamentacaoClassificacao(idClassificacaoTributaria, data);
    if (f === null) throw new FundamentacaoClassificacaoNaoEncontradaException(idClassificacaoTributaria, data);
    return f;
  }
}

/** TemplateTokenizerService + TokenizerService: substitui [placeholders]. */
export function substituirPlaceholders(template: string, values: Map<string, string>): string {
  if (!template.includes("[")) return template;
  let result = "";
  let last = 0;
  const len = template.length;
  while (last < len) {
    const open = template.indexOf("[", last);
    if (open < 0) {
      result += template.slice(last);
      break;
    }
    const close = template.indexOf("]", open + 1);
    if (close < 0) {
      result += template.slice(last);
      break;
    }
    if (open > last) result += template.slice(last, open);
    const key = template.slice(open + 1, close);
    result += values.get(key) ?? "";
    last = close + 1;
  }
  return result;
}

/**
 * MemoriaCalculoService — gera o texto de memória de cálculo. PARITY: usa
 * JBD.toString() (escala preservada), igual ao BigDecimal original.
 */
export class MemoriaCalculoService {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly repo: Repositories,
    private readonly fundamentacaoService: FundamentacaoClassificacaoService,
    private readonly tratamentoService: TratamentoTributarioService,
    private readonly memoriaCalculoHabilitada: boolean,
  ) {}

  gerarMemoriaCalculoCbsIbs(
    tratamentoClassificacao: TratamentoClassificacaoDTO,
    tributo: CbsIbsOutput | null,
    quantidade: JBD | null,
    unidade: string | null,
    data: string,
  ): void {
    if (!this.memoriaCalculoHabilitada) return;
    if (tributo === null) return;

    const fundamentacao = this.fundamentacaoService.buscar(tratamentoClassificacao.idClassificacaoTributaria, data);
    const tt = this.tratamentoService.buscar(tratamentoClassificacao.idTratamentoTributario);

    const norma = fundamentacao.textoCurto ?? "";
    const tratamento = tt.descricao ?? "";
    const baseCalculo = tributo.baseCalculo !== null ? tributo.baseCalculo.toString() : "0";
    const aliquotaAdValorem = tributo.aliquota !== null ? tributo.aliquota.toString() : "0";
    const aliquotaAdRem =
      tributo.grupoMonofasia !== null &&
      tributo.grupoMonofasia.tributoMonofasico !== null &&
      tributo.grupoMonofasia.tributoMonofasico.aliquotaAdRem !== null
        ? tributo.grupoMonofasia.tributoMonofasico.aliquotaAdRem.toString()
        : "0";
    const percentualReducao =
      tributo.grupoReducao !== null && tributo.grupoReducao.pRedAliq !== null
        ? tributo.grupoReducao.pRedAliq.toString()
        : "0";
    const aliquotaDesoneracao = "0";
    const montanteDesoneracao = "0";
    const percentualDiferimento =
      tributo.grupoDiferimento !== null && tributo.grupoDiferimento.pDif !== null && tributo.grupoDiferimento.vDif !== null
        ? tributo.grupoDiferimento.pDif.toString()
        : "0";
    const valorDiferimento =
      tributo.grupoDiferimento !== null && tributo.grupoDiferimento.pDif !== null && tributo.grupoDiferimento.vDif !== null
        ? tributo.grupoDiferimento.vDif.toString()
        : "0";

    const valores = new Map<string, string>([
      ["norma", norma],
      ["tratamento", tratamento],
      ["base_calculo", baseCalculo],
      ["aliquota_ad_valorem", aliquotaAdValorem],
      ["aliquota_ad_rem", aliquotaAdRem],
      ["quantidade", quantidade !== null ? quantidade.toString() : "0"],
      ["unidade", unidade ?? ""],
      ["percentual_reducao", percentualReducao],
      ["percentual_diferimento", percentualDiferimento],
      ["valor_diferimento", valorDiferimento],
      ["aliquota_desoneracao", aliquotaDesoneracao],
      ["montante_desoneracao", montanteDesoneracao],
    ]);

    const texto = fundamentacao.memoriaCalculo;
    const memoria = isBlank(texto)
      ? "Texto de memória de cálculo não encontrado"
      : substituirPlaceholders(texto!, valores);
    tributo.memoriaCalculo = memoria;
  }

  gerarMemoriaCalculoImpostoSeletivo(
    tratamentoClassificacao: TratamentoClassificacaoDTO,
    tributo: ImpostoSeletivoDomain,
    quantidade: JBD | null,
    unidade: string | null,
    data: string,
  ): void {
    if (!this.memoriaCalculoHabilitada) return;
    const fundamentacao = this.fundamentacaoService.buscar(tratamentoClassificacao.idClassificacaoTributaria, data);
    const norma = fundamentacao.textoCurto ?? "";
    const tt = this.tratamentoService.buscar(tratamentoClassificacao.idTratamentoTributario);
    const tratamento = tt.descricao ?? "";
    const baseCalculo = tributo.vBCIS.toString();
    const aliquotaAdValorem = tributo.pIS !== null ? tributo.pIS.toString() : "";
    const aliquotaAdRem = tributo.pISEspec !== null ? tributo.pISEspec.toString() : "";
    const valores = new Map<string, string>([
      ["norma", norma],
      ["tratamento", tratamento],
      ["base_calculo", baseCalculo],
      ["aliquota_ad_valorem", aliquotaAdValorem],
      ["aliquota_ad_rem", aliquotaAdRem],
      ["quantidade", quantidade !== null ? quantidade.toString() : ""],
      ["unidade", unidade ?? ""],
    ]);
    const texto = fundamentacao.memoriaCalculo;
    const memoria = isBlank(texto)
      ? "Texto de memória de cálculo não encontrado"
      : substituirPlaceholders(texto!, valores);
    tributo.memoriaCalculo = memoria;
  }
}
