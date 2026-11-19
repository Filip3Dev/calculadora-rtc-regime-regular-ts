/**
 * Motor de cálculo — porte fiel (paridade estrita) de:
 *   CalculoCbsIbsService · CalculoImpostoSeletivoService · CalculoTributoService
 *   ProcessamentoItemService · CalculadoraService · ObservabilidadeService
 *   BaseCalculoUnificadaService · collectors
 *
 * PARITY: comportamentos questionáveis do original são reproduzidos e
 * marcados com "// PARITY:" (bug do diferimento, BC negativa zerada em
 * silêncio, constantes de monofasia hardcoded etc.).
 */
import { ExpressionEvaluator } from "../expression/ExpressionEvaluator.js";
import { JBD, arredondarInterno, dividir, dividirPorCem, multiplicar } from "../model/jbd.js";
import {
  AliquotaImpostoSeletivoNaoInformadaException,
  AliquotasNominaisInformadasIndevidamenteException,
  AliquotasNominaisNaoInformadasException,
  BaseCalculoComponentesInconsistenteException,
  BaseCalculoInconsistenteException,
  BaseCalculoMenorBaseCalculoImpostoSeletivoException,
  BaseCalculoNaoInformadaException,
  ClassificacaoTributariaNaoEncontradaException,
  ClassificacaoTributariaNaoVinculadaSituacaoTributariaException,
  ErroFaltaImplementacaoException,
  ErroGenericoValidacaoException,
  ImpostoSeletivoNaoAdmitidoTipoDfeException,
  ImpostoSeletivoNaoInformadoException,
  IncompatibilidadeSuspensaoException,
  NcmNaoEncontradaException,
  NcmNbsSimultaneasException,
  NbsNaoEncontradaException,
  NegocioException,
  TipoAliquotaDesconhecidoException,
  TributacaoRegularNaoInformadaException,
} from "../errors.js";
import {
  type BaseCalculoBase,
  type BaseCalculoNatureza,
  ElementoBaseCalculo,
  ImpostoSeletivoInput,
  ItemOperacaoInput,
  ObjetoDomain,
  OperacaoInput,
  ROCDomain,
  Tributo,
  Tributo as TributoEnum,
  type AliquotaImpostoSeletivoModel,
  type BaseCalculoUnificadaOutput,
  CbsIbsOutput,
  type ClassificacaoTributariaCalculoDTO,
  type ClassificacaoTributariaDTO,
  type ComponentesBaseCalculoInput,
  type DiferimentoDomain,
  type EstadoItem,
  type GrupoDiferimentoMonofasiaOutput,
  type GrupoEtapaMonofasiaOutput,
  type IBSCBSDomain,
  type IBSCBSTotalDomain,
  type ImpostoSeletivoDomain,
  type OperacaoModel,
  type ReducaoAliquotaDomain,
  type TipoEnteGovernamental,
  type TratamentoClassificacaoDTO,
  type TratamentoClassificacaoModel,
  TributacaoCompraGovernamentalDomain,
  TributacaoRegularOutput,
  type TributosDomain,
} from "../model/types.js";
import {
  AliquotaAdRemProdutoService,
  AliquotaAdValoremProdutoService,
  AliquotaAdValoremServicoService,
  AliquotaPadraoService,
  AliquotaReferenciaService,
  ClassificacaoTributariaService,
  FundamentacaoClassificacaoService,
  MemoriaCalculoService,
  MunicipioService,
  NcmAplicavelService,
  NcmService,
  NbsAplicavelService,
  NbsService,
  PercentualReducaoService,
  RedutorCompraGovernamentalService,
  SituacaoTributariaService,
  TipoDfeClassificacaoService,
  TipoDfeService,
  TransferenciaCBSService,
  TratamentoClassificacaoService,
  TratamentoTributarioService,
  UfService,
  ValidacaoNomenclaturaService,
  NomenclaturaService,
} from "./support.js";
import type { Repositories } from "../db/repositories.js";
import { normalizarSigla } from "../model/types.js";

const isBlank = (s: string | null | undefined): boolean => s === null || s === undefined || s.trim() === "";
const isNotBlank = (s: string | null | undefined): boolean => !isBlank(s);

/** Variáveis de expressão (VariavelExpressao) — nome → valor (null vira ZERO como no original). */
function entry(nome: string, v: JBD | null | undefined): [string, JBD] {
  return [nome, v ?? JBD.ZERO];
}

// ─── Base de cálculo unificada ───────────────────────────────────────────────

export class BaseCalculoUnificadaService {
  calcular(
    componentes: ComponentesBaseCalculoInput,
    ano: number,
    natureza: BaseCalculoNatureza | null,
    tpDoc: number | null,
  ): BaseCalculoUnificadaOutput {
    if (tpDoc === null || (tpDoc !== 55 && tpDoc !== 65)) {
      throw new ErroGenericoValidacaoException("Tipo de documento deve ser 55 (NF-e) ou 65 (NFC-e)");
    }
    let rgSoma = JBD.ZERO;
    let rgSubtrai = JBD.ZERO;
    let isSoma = JBD.ZERO;
    let isSubtrai = JBD.ZERO;
    let snSoma = JBD.ZERO;
    let snSubtrai = JBD.ZERO;
    const avisos: string[] = [];

    for (const elemento of ElementoBaseCalculo.TODOS) {
      if (!elemento.campoCompoeBase(ano, natureza, tpDoc)) {
        const valor = componenteValor(componentes, elemento);
        if (valor !== null && !valor.isZero()) {
          const motivo = elemento.motivoNaoComposicao(ano, natureza, tpDoc);
          if (motivo !== null) avisos.push(motivo);
        }
        continue;
      }
      const valor = componenteValor(componentes, elemento);
      if (valor === null || valor.isZero()) continue;
      if (elemento.operacao === "SOMA") {
        if (elemento.aplicaBase("RG")) rgSoma = rgSoma.add(valor);
        if (elemento.aplicaBase("IS")) isSoma = isSoma.add(valor);
        if (elemento.aplicaBase("SN")) snSoma = snSoma.add(valor);
      } else {
        if (elemento.aplicaBase("RG")) rgSubtrai = rgSubtrai.add(valor);
        if (elemento.aplicaBase("IS")) isSubtrai = isSubtrai.add(valor);
        if (elemento.aplicaBase("SN")) snSubtrai = snSubtrai.add(valor);
      }
    }
    const baseRG = subtrairJbd(rgSoma, rgSubtrai);
    const baseIS = subtrairJbd(isSoma, isSubtrai);
    const baseSN = subtrairJbd(snSoma, snSubtrai);
    return { baseRG, baseIS, baseSN, avisos };
  }
}

function componenteValor(c: ComponentesBaseCalculoInput, e: ElementoBaseCalculo): JBD | null {
  return c.get(e);
}
function subtrairJbd(a: JBD, b: JBD): JBD {
  return a.subtract(b).setScale(8);
}

// ─── Cálculo CBS/IBS ─────────────────────────────────────────────────────────

// PARITY: constantes de monofasia hardcoded no original (gasolina tipo A/EAC)
const PBIO = JBD.parse("30");
const PDIF = JBD.parse("100");
const VARIACAO_EAC = JBD.parse("5");
const ALIQUOTA_EAC = JBD.parse("0.1922");
const ALIQUOTA_GASOLINA_TIPO_A = JBD.parse("0.7925");

export class CalculoCbsIbsService {
  private readonly avaliador = new ExpressionEvaluator();

  constructor(
    private readonly percentualReducaoService: PercentualReducaoService,
    private readonly aliquotaReferenciaService: AliquotaReferenciaService,
    private readonly aliquotaPadraoService: AliquotaPadraoService,
    private readonly aliquotaAdValoremServicoService: AliquotaAdValoremServicoService,
    private readonly tratamentoService: TratamentoTributarioService,
    private readonly classificacaoTributariaService: ClassificacaoTributariaService,
    private readonly situacaoTributariaService: SituacaoTributariaService,
  ) {}

  calcularCbsIbs(
    tributo: TributoEnum,
    codigoUf: number | null,
    codigoMunicipio: number | null,
    item: ItemOperacaoInput,
    tratamentoClassificacao: TratamentoClassificacaoDTO,
    impostoSeletivoCalculado: JBD,
    temTributacaoRegular: boolean,
    data: string,
    tpEnteGov: TipoEnteGovernamental | null,
    pRedutorCompraGov: JBD | null,
  ): CbsIbsOutput | null {
    const idTributo = tributo;
    let cst: string | null = null;
    let cClassTrib: string | null = null;

    const tratamentoTributario = this.tratamentoService.buscar(tratamentoClassificacao.idTratamentoTributario);
    const classificacaoTributaria = this.classificacaoTributariaService.buscarClassificacaoTributariaCalculo(
      tratamentoClassificacao.idClassificacaoTributaria,
    );
    const situacaoTributaria = this.situacaoTributariaService.consultarSituacaoTributariaPorCodigo(item.cst, idTributo, data);

    if (temTributacaoRegular) {
      cst = item.tributacaoRegular!.cst;
      cClassTrib = item.tributacaoRegular!.cClassTrib;
    }

    const expressaoAliquota = tratamentoTributario.expressaoAliquota;
    const expressaoBaseCalculo = tratamentoTributario.expressaoBaseCalculo;
    const expressaoAliquotaEfetiva = tratamentoTributario.expressaoAliquotaEfetiva;
    const expressaoTributoCalculado = tratamentoTributario.expressaoTributoCalculado;
    const expressaoTributoDevido = tratamentoTributario.expressaoTributoDevido;
    const expressaoPercentualDiferimento = tratamentoTributario.expressaoPercentualDiferimento;
    const expressaoValorDiferimento = tratamentoTributario.expressaoValorDiferimento;

    if (tratamentoTributario.inPossuiAjuste === 1) {
      throw new ErroFaltaImplementacaoException(classificacaoTributaria.codigo);
    }

    const possuiPercentualReducao = tratamentoTributario.inPossuiPercentualReducao === 1;
    let valorPercentualReducao: JBD | null = null;
    const valorAjuste: JBD | null = null;
    const valorRedutor: JBD | null = null;

    const baseCalculoInformada = item.baseCalculo;
    const quantidade = item.quantidade;
    let impostoSeletivoInformado: JBD | null = null;
    if (item.impostoSeletivo !== null) {
      impostoSeletivoInformado = item.impostoSeletivo.getValorImpostoSeletivoInformado();
    }

    let valorAliquotaPadraoOuReferencia: JBD | null = null;
    let valorAliquotaReferencia: JBD | null = null;
    let valorAliquotaAdValorem: JBD | null = null;
    let valorAliquotaAdRem: JBD | null = null;
    let valorAliquota: JBD | null = null;
    let valorAliquotaAdRemPrincipal: JBD | null = null;
    let valorAliquotaAdRemSecundaria: JBD | null = null;
    let variacaoPontoPercentual: JBD | null = null;
    let pBio: JBD | null = null;
    let pDif: JBD | null = null;

    if (possuiPercentualReducao) {
      const percentualReducao = this.percentualReducaoService.buscar(classificacaoTributaria.id, idTributo, data);
      valorPercentualReducao = dividirPorCem(percentualReducao);
    }

    // PARITY: ajuste hardcoded do original para o cClassTrib 510001
    let tipoAliquota: string | null;
    if (classificacaoTributaria.codigo === "510001") {
      tipoAliquota = "Padrão";
    } else {
      tipoAliquota = classificacaoTributaria.tipoAliquota;
    }

    const aliquotaInformada = this.obterAliquotaNominal(tributo, item);

    let aliquotaInformadaAplicada = false;
    let aliquotaDivididaPorCem = false;
    switch (tipoAliquota) {
      case "Padrão": {
        if (aliquotaInformada !== null) {
          valorAliquota = dividirPorCem(aliquotaInformada);
          aliquotaInformadaAplicada = true;
        } else {
          valorAliquota = this.buscarAliquotaPadrao(idTributo, codigoUf, codigoMunicipio, data);
        }
        aliquotaDivididaPorCem = true;
        break;
      }
      case "Uniforme nacional (referência)": {
        if (aliquotaInformada !== null) {
          valorAliquota = dividirPorCem(aliquotaInformada);
          aliquotaInformadaAplicada = true;
        } else {
          valorAliquota = dividirPorCem(this.aliquotaReferenciaService.buscar(idTributo, data));
        }
        aliquotaDivididaPorCem = true;
        break;
      }
      case "Uniforme setorial": {
        if (tratamentoTributario.inPossuiMonofasia === 1) {
          // PARITY: alíquotas ad rem de gasolina hardcoded (original)
          valorAliquotaAdRemPrincipal = ALIQUOTA_GASOLINA_TIPO_A;
          valorAliquotaAdRemSecundaria = ALIQUOTA_EAC;
          pBio = dividirPorCem(PBIO);
          pDif = dividirPorCem(PDIF);
          variacaoPontoPercentual = VARIACAO_EAC;
        } else {
          if (aliquotaInformada !== null) {
            valorAliquota = dividirPorCem(aliquotaInformada);
            aliquotaInformadaAplicada = true;
          } else {
            valorAliquota = this.buscarAliquotaUniformeSetorial(item.nbs, idTributo, classificacaoTributaria.id, data);
          }
          aliquotaDivididaPorCem = true;
        }
        break;
      }
      case "Fixa": {
        if (aliquotaInformada !== null) {
          valorAliquota = dividirPorCem(aliquotaInformada);
          aliquotaInformadaAplicada = true;
        } else {
          valorAliquota = this.buscarAliquotaFixa(idTributo, classificacaoTributaria.id, data);
        }
        aliquotaDivididaPorCem = true;
        break;
      }
      case "Sem alíquota": {
        if (aliquotaInformada !== null) {
          valorAliquota = dividirPorCem(aliquotaInformada);
          aliquotaInformadaAplicada = true;
          aliquotaDivididaPorCem = true;
        } else {
          valorAliquota = JBD.ZERO;
        }
        break;
      }
      case "Alíquotas Combinadas (Ad Valorem e Ad Rem)":
        break;
      default:
        throw new TipoAliquotaDesconhecidoException(tipoAliquota ?? "null", cClassTrib, cst);
    }

    // ── Cascata de expressões ──
    let resultadoAliquota: JBD | null = null;
    let resultadoAliquotaEfetiva: JBD | null = null;
    let resultadoBaseCalculo: JBD;
    let resultadoTributoCalculado: JBD;
    let resultadoTributoDevido: JBD | null = null;
    let resultadoPercentualDiferimento: JBD | null = null;
    let resultadoValorDiferimento: JBD | null = null;

    if (aliquotaInformadaAplicada && !expressaoUsaAliquota(expressaoAliquota)) {
      // A alíquota nominal informada prevalece sobre expressão fixa persistida
      resultadoAliquota = valorAliquota;
    } else if (isNotBlank(expressaoAliquota)) {
      const variaveis0 = new Map([
        entry("aliquota", valorAliquota),
        entry("quantidade", quantidade),
        entry("percentualReducao", valorPercentualReducao),
        entry("aliquotaPadraoOuReferencia", valorAliquotaPadraoOuReferencia),
        entry("aliquotaReferencia", valorAliquotaReferencia),
        entry("aliquotaAdValorem", valorAliquotaAdValorem),
        entry("aliquotaAdRem", valorAliquotaAdRem),
        entry("ajuste", valorAjuste),
        entry("redutor", valorRedutor),
        entry("aliquotaAdRemPrincipal", valorAliquotaAdRemPrincipal),
        entry("aliquotaAdRemSecundaria", valorAliquotaAdRemSecundaria),
        entry("variacaoPontoPercentual", variacaoPontoPercentual),
        entry("pBio", pBio),
        entry("percentualDiferimento", pDif),
      ]);
      resultadoAliquota = this.avaliador.evaluate(expressaoAliquota!, variaveis0);
    }

    if (isNotBlank(expressaoAliquotaEfetiva)) {
      const variaveis1 = new Map([
        entry("quantidade", quantidade),
        entry("aliquota", resultadoAliquota),
        entry("percentualReducao", valorPercentualReducao),
        entry("pRedutorCompraGov", pRedutorCompraGov),
        entry("aliquotaPadraoOuReferencia", valorAliquotaPadraoOuReferencia),
        entry("aliquotaReferencia", valorAliquotaReferencia),
        entry("aliquotaAdValorem", valorAliquotaAdValorem),
        entry("aliquotaAdRem", valorAliquotaAdRem),
        entry("ajuste", valorAjuste),
        entry("redutor", valorRedutor),
        entry("aliquotaAdRemPrincipal", valorAliquotaAdRemPrincipal),
        entry("aliquotaAdRemSecundaria", valorAliquotaAdRemSecundaria),
        entry("variacaoPontoPercentual", variacaoPontoPercentual),
        entry("pBio", pBio),
        entry("percentualDiferimento", pDif),
      ]);
      resultadoAliquotaEfetiva = this.avaliador.evaluate(expressaoAliquotaEfetiva!, variaveis1);
    }

    const variaveis2 = new Map([
      entry("quantidade", quantidade),
      entry("aliquota", resultadoAliquota),
      entry("aliquotaEfetiva", resultadoAliquotaEfetiva),
      entry("impostoSeletivoInformado", impostoSeletivoInformado),
      entry("baseCalculoInformada", baseCalculoInformada),
      entry("impostoSeletivoCalculado", impostoSeletivoCalculado),
      entry("percentualReducao", valorPercentualReducao),
      entry("aliquotaPadraoOuReferencia", valorAliquotaPadraoOuReferencia),
      entry("aliquotaReferencia", valorAliquotaReferencia),
      entry("aliquotaAdValorem", valorAliquotaAdValorem),
      entry("aliquotaAdRem", valorAliquotaAdRem),
      entry("ajuste", valorAjuste),
      entry("redutor", valorRedutor),
      entry("aliquotaAdRemPrincipal", valorAliquotaAdRemPrincipal),
      entry("aliquotaAdRemSecundaria", valorAliquotaAdRemSecundaria),
      entry("variacaoPontoPercentual", variacaoPontoPercentual),
      entry("pBio", pBio),
      entry("percentualDiferimento", pDif),
    ]);

    resultadoBaseCalculo = this.avaliador.evaluate(expressaoBaseCalculo!, variaveis2);

    if (resultadoBaseCalculo.isNegative()) {
      // PARITY: o original zera em silêncio (deveria lançar exceção)
      resultadoBaseCalculo = JBD.ZERO;
    }

    const variaveis3 = new Map([
      entry("quantidade", quantidade),
      entry("baseCalculo", resultadoBaseCalculo),
      entry("aliquota", resultadoAliquota),
      entry("aliquotaEfetiva", resultadoAliquotaEfetiva),
      entry("baseCalculoInformada", baseCalculoInformada),
      entry("impostoSeletivoInformado", impostoSeletivoInformado),
      entry("impostoSeletivoCalculado", impostoSeletivoCalculado),
      entry("percentualReducao", valorPercentualReducao),
      entry("aliquotaPadraoOuReferencia", valorAliquotaPadraoOuReferencia),
      entry("aliquotaReferencia", valorAliquotaReferencia),
      entry("aliquotaAdValorem", valorAliquotaAdValorem),
      entry("aliquotaAdRem", valorAliquotaAdRem),
      entry("ajuste", valorAjuste),
      entry("redutor", valorRedutor),
      entry("aliquotaAdRemPrincipal", valorAliquotaAdRemPrincipal),
      entry("aliquotaAdRemSecundaria", valorAliquotaAdRemSecundaria),
      entry("variacaoPontoPercentual", variacaoPontoPercentual),
      entry("pBio", pBio),
      entry("percentualDiferimento", pDif),
    ]);

    resultadoTributoCalculado = this.avaliador.evaluate(expressaoTributoCalculado!, variaveis3);

    if (isNotBlank(expressaoTributoDevido)) {
      const variaveis4 = new Map([
        entry("tributoCalculado", resultadoTributoCalculado),
        entry("quantidade", quantidade),
        entry("baseCalculo", resultadoBaseCalculo),
        entry("aliquota", resultadoAliquota),
        entry("aliquotaEfetiva", resultadoAliquotaEfetiva),
        entry("baseCalculoInformada", baseCalculoInformada),
        entry("impostoSeletivoInformado", impostoSeletivoInformado),
        entry("impostoSeletivoCalculado", impostoSeletivoCalculado),
        entry("percentualReducao", valorPercentualReducao),
        entry("aliquotaPadraoOuReferencia", valorAliquotaPadraoOuReferencia),
        entry("aliquotaReferencia", valorAliquotaReferencia),
        entry("aliquotaAdValorem", valorAliquotaAdValorem),
        entry("aliquotaAdRem", valorAliquotaAdRem),
        entry("ajuste", valorAjuste),
        entry("redutor", valorRedutor),
        entry("aliquotaAdRemPrincipal", valorAliquotaAdRemPrincipal),
        entry("aliquotaAdRemSecundaria", valorAliquotaAdRemSecundaria),
        entry("variacaoPontoPercentual", variacaoPontoPercentual),
        entry("pBio", pBio),
        entry("percentualDiferimento", pDif),
      ]);
      resultadoTributoDevido = this.avaliador.evaluate(expressaoTributoDevido!, variaveis4);
    }

    if (isNotBlank(expressaoPercentualDiferimento) && isNotBlank(expressaoValorDiferimento)) {
      const variaveis5 = new Map([
        entry("tributoCalculado", resultadoTributoCalculado),
        entry("quantidade", quantidade),
        entry("baseCalculo", resultadoBaseCalculo),
        entry("aliquota", resultadoAliquota),
        entry("aliquotaEfetiva", resultadoAliquotaEfetiva),
        entry("baseCalculoInformada", baseCalculoInformada),
        entry("impostoSeletivoInformado", impostoSeletivoInformado),
        entry("impostoSeletivoCalculado", impostoSeletivoCalculado),
        entry("percentualReducao", valorPercentualReducao),
        entry("aliquotaPadraoOuReferencia", valorAliquotaPadraoOuReferencia),
        entry("aliquotaReferencia", valorAliquotaReferencia),
        entry("aliquotaAdValorem", valorAliquotaAdValorem),
        entry("aliquotaAdRem", valorAliquotaAdRem),
        entry("ajuste", valorAjuste),
        entry("redutor", valorRedutor),
      ]);
      resultadoPercentualDiferimento = this.avaliador.evaluate(expressaoPercentualDiferimento!, variaveis5);

      const variaveis6 = new Map([
        entry("percentualDiferimento", resultadoPercentualDiferimento),
        entry("tributoCalculado", resultadoTributoCalculado),
        entry("quantidade", quantidade),
        entry("baseCalculo", resultadoBaseCalculo),
        entry("aliquota", resultadoAliquota),
        entry("aliquotaEfetiva", resultadoAliquotaEfetiva),
        entry("baseCalculoInformada", baseCalculoInformada),
        entry("impostoSeletivoInformado", impostoSeletivoInformado),
        entry("impostoSeletivoCalculado", impostoSeletivoCalculado),
        entry("percentualReducao", valorPercentualReducao),
        entry("aliquotaPadraoOuReferencia", valorAliquotaPadraoOuReferencia),
        entry("aliquotaReferencia", valorAliquotaReferencia),
        entry("aliquotaAdValorem", valorAliquotaAdValorem),
        entry("aliquotaAdRem", valorAliquotaAdRem),
        entry("ajuste", valorAjuste),
        entry("redutor", valorRedutor),
      ]);
      resultadoValorDiferimento = this.avaliador.evaluate(expressaoValorDiferimento!, variaveis6);

      // PARITY: bug do original — o devido deveria derivar de resultadoTributoDevido
      resultadoTributoCalculado = arredondarInterno(resultadoTributoCalculado.subtract(resultadoValorDiferimento))!;
      resultadoTributoDevido = arredondarInterno(resultadoTributoCalculado.subtract(resultadoValorDiferimento))!;

      if (resultadoTributoCalculado.isNegative()) resultadoTributoCalculado = JBD.ZERO;
      if (resultadoTributoDevido !== null && resultadoTributoDevido.isNegative()) resultadoTributoDevido = JBD.ZERO;
    }

    if (situacaoTributaria === null || situacaoTributaria.inGrupoIbsCbs !== 1) {
      return null;
    }

    const output = new CbsIbsOutput();
    output.grupoReducao =
      classificacaoTributaria.inGrupoReducao !== 1 || (temTributacaoRegular && tpEnteGov === null)
        ? null
        : this.obterGrupoReducao(classificacaoTributaria, resultadoAliquotaEfetiva, valorPercentualReducao, aliquotaDivididaPorCem);
    output.compraGovernamental = this.obterGrupoCompraGov(tpEnteGov, tributo, resultadoAliquotaEfetiva, resultadoTributoDevido);
    output.tributacaoRegular = temTributacaoRegular
      ? this.obterGrupoDesoneracao(
          cst,
          cClassTrib,
          resultadoBaseCalculo,
          resultadoAliquota,
          valorPercentualReducao ?? JBD.ZERO,
          aliquotaDivididaPorCem,
          possuiPercentualReducao,
        )
      : null;
    output.grupoDiferimento = this.obterGrupoDiferimento(resultadoValorDiferimento, resultadoPercentualDiferimento);
    output.grupoMonofasia = this.obterGrupoMonofasia(
      classificacaoTributaria,
      quantidade,
      valorAliquotaAdRemPrincipal,
      valorAliquotaAdRemSecundaria,
      resultadoTributoCalculado,
      resultadoTributoDevido,
      variacaoPontoPercentual,
    );
    output.tributoCalculado = temTributacaoRegular ? JBD.ZERO : resultadoTributoCalculado;
    output.tributoDevido = temTributacaoRegular ? JBD.ZERO : resultadoTributoDevido;
    output.aliquota =
      temTributacaoRegular
        ? JBD.ZERO
        : aliquotaDivididaPorCem && resultadoAliquota !== null
          ? resultadoAliquota.movePointRight(2)
          : resultadoAliquota;
    output.baseCalculo = resultadoBaseCalculo;
    output.quantidade = quantidade;
    return output;
  }

  private obterGrupoCompraGov(
    tpEnteGov: TipoEnteGovernamental | null,
    t: TributoEnum,
    aliquota: JBD | null,
    valor: JBD | null,
  ): TributacaoCompraGovernamentalDomain | null {
    if (tpEnteGov === null) return null;
    const b = new TributacaoCompraGovernamentalDomain();
    // PARITY: o original chama aliquota.movePointRight(2) sem null-check (NPE → 500)
    const alq = aliquota !== null ? aliquota.movePointRight(2) : null;
    if (t === Tributo.CBS) {
      if (alq === null) throw new Error("Alíquota nula no grupo de compra governamental");
      b.pAliqCBS = alq;
      b.vTribCBS = valor ?? JBD.ZERO;
    } else if (t === Tributo.IBS_ESTADUAL) {
      if (alq === null) throw new Error("Alíquota nula no grupo de compra governamental");
      b.pAliqIBSUF = alq;
      b.vTribIBSUF = valor ?? JBD.ZERO;
    } else if (t === Tributo.IBS_MUNICIPAL) {
      if (alq === null) throw new Error("Alíquota nula no grupo de compra governamental");
      b.pAliqIBSMun = alq;
      b.vTribIBSMun = valor ?? JBD.ZERO;
    } else {
      throw new Error(`Tributo ${t} nao possui compra governamental`);
    }
    return b;
  }

  private buscarAliquotaPadrao(idTributo: number, codigoUf: number | null, codigoMunicipio: number | null, data: string): JBD {
    const aliquota = this.aliquotaPadraoService.buscarAliquota(idTributo, codigoUf, codigoMunicipio, data);
    return dividirPorCem(aliquota.valorAplicavel())!;
  }

  private buscarAliquotaUniformeSetorial(nbs: string | null, idTributo: number, idCltr: number, data: string): JBD {
    let aliquota = this.aliquotaAdValoremServicoService.buscarAliquotaAdValorem(nbs ?? "", idTributo, idCltr, data);
    if (aliquota === null) {
      aliquota = this.aliquotaAdValoremServicoService.buscarAliquotaAdValoremPorClassificacaoTributaria(idTributo, idCltr, data);
      if (aliquota === null) {
        throw new ErroGenericoValidacaoException(`Alíquota uniforme setorial não encontrada em ${data}`);
      }
    }
    return dividirPorCem(aliquota)!;
  }

  private buscarAliquotaFixa(idTributo: number, idCltr: number, data: string): JBD {
    const aliquotaFixa = this.aliquotaAdValoremServicoService.buscarAliquotaAdValoremPorClassificacaoTributaria(idTributo, idCltr, data);
    if (aliquotaFixa === null) {
      throw new ErroGenericoValidacaoException(`Alíquota fixa não encontrada em ${data}`);
    }
    return dividirPorCem(aliquotaFixa)!;
  }

  private obterAliquotaNominal(tributo: TributoEnum, item: ItemOperacaoInput): JBD | null {
    if (item.aliquotasNominais === null) return null;
    switch (tributo) {
      case Tributo.CBS:
        return item.aliquotasNominais.cbs;
      case Tributo.IBS_ESTADUAL:
        return item.aliquotasNominais.ibsEstadual;
      case Tributo.IBS_MUNICIPAL:
        return item.aliquotasNominais.ibsMunicipal;
      default:
        return null;
    }
  }

  private obterGrupoReducao(
    classificacaoTributaria: ClassificacaoTributariaCalculoDTO,
    aliquotaEfetiva: JBD | null,
    percentualReducao: JBD | null,
    aliquotaDivididaPorCem: boolean,
  ): ReducaoAliquotaDomain | null {
    if (percentualReducao === null || aliquotaEfetiva === null || classificacaoTributaria.inGrupoReducao !== 1) {
      return null;
    }
    return {
      pRedAliq: percentualReducao.movePointRight(2),
      pAliqEfet: aliquotaDivididaPorCem ? aliquotaEfetiva.movePointRight(2) : aliquotaEfetiva,
    };
  }

  private obterGrupoDesoneracao(
    cst: string | null,
    cClassTrib: string | null,
    baseCalculo: JBD,
    aliquota: JBD | null,
    percentualReducao: JBD,
    aliquotaDivididaPorCem: boolean,
    possuiPercentualReducao: boolean,
  ): TributacaoRegularOutput {
    let aliquotaEfetiva = aliquota;
    if (possuiPercentualReducao) {
      const redutor = JBD.ONE.subtract(percentualReducao);
      aliquotaEfetiva = multiplicar(aliquota, redutor);
    }
    const tributoDevido = multiplicar(baseCalculo, aliquotaEfetiva);
    return new TributacaoRegularOutput(
      cst,
      cClassTrib,
      baseCalculo,
      aliquotaDivididaPorCem ? aliquotaEfetiva!.movePointRight(2) : aliquotaEfetiva,
      tributoDevido,
    );
  }

  private obterGrupoDiferimento(valorDiferimento: JBD | null, percentualDiferimento: JBD | null): DiferimentoDomain | null {
    if (valorDiferimento === null || percentualDiferimento === null) return null;
    return { vDif: valorDiferimento, pDif: percentualDiferimento.movePointRight(2) };
  }

  private obterGrupoMonofasia(
    classificacaoTributaria: ClassificacaoTributariaCalculoDTO,
    quantidade: JBD | null,
    aliquotaAdRemPrincipal: JBD | null,
    aliquotaAdRemSecundaria: JBD | null,
    tributoCalculado: JBD | null,
    tributoDevido: JBD | null,
    variacaoPontoPercentual: JBD | null,
  ) {
    let grupoMonoPadrao: GrupoEtapaMonofasiaOutput | null = null;
    let grupoMonoReten: GrupoEtapaMonofasiaOutput | null = null;
    let grupoMonoRet: GrupoEtapaMonofasiaOutput | null = null;
    let grupoMonoDiferimento: GrupoDiferimentoMonofasiaOutput | null = null;

    if (classificacaoTributaria.inGrupoMonofasiaPadrao === 1) {
      grupoMonoPadrao = {
        quantidade:
          classificacaoTributaria.inGrupoMonofasiaRet !== 1
            ? quantidade
            : dividir(quantidade!.multiply(variacaoPontoPercentual!), JBD.parse("100")),
        aliquotaAdRem: classificacaoTributaria.inGrupoMonofasiaRet !== 1 ? aliquotaAdRemPrincipal : aliquotaAdRemSecundaria,
        valor: tributoCalculado,
      };
    }
    if (classificacaoTributaria.inGrupoMonofasiaReten === 1) {
      grupoMonoReten = {
        quantidade: multiplicar(quantidade, obterFatorBioCombustivel()),
        aliquotaAdRem: aliquotaAdRemSecundaria,
        valor: tributoDevido,
      };
    }
    if (classificacaoTributaria.inGrupoMonofasiaRet === 1) {
      grupoMonoRet = { quantidade, aliquotaAdRem: aliquotaAdRemPrincipal, valor: tributoDevido };
    }
    if (classificacaoTributaria.inGrupoMonofasiaDiferimento === 1) {
      grupoMonoDiferimento = {
        percentualDiferimento: dividir(
          tributoCalculado!.subtract(tributoDevido!),
          tributoCalculado!,
        )!.movePointRight(2),
        valorDiferimento: tributoCalculado!.subtract(tributoDevido!),
      };
    }
    return {
      tributoMonofasico: grupoMonoPadrao,
      tributoSujeitoRetencao: grupoMonoReten,
      tributoRetido: grupoMonoRet,
      tributoDiferido: grupoMonoDiferimento,
    };
  }
}

function expressaoUsaAliquota(expressao: string | null | undefined): boolean {
  return isNotBlank(expressao) && /.*\baliquota\b.*/.test(expressao!);
}

function obterFatorBioCombustivel(): JBD {
  return dividir(PBIO, JBD.CEM.subtract(PBIO))!;
}

// ─── Imposto Seletivo ────────────────────────────────────────────────────────

export class CalculoImpostoSeletivoService {
  private readonly avaliador = new ExpressionEvaluator();

  constructor(private readonly tratamentoService: TratamentoTributarioService) {}

  calcularImpostoSeletivo(
    _idTributo: number,
    item: ItemOperacaoInput,
    tratamentoClassificacao: TratamentoClassificacaoDTO,
    aliquotaImpostoSeletivo: AliquotaImpostoSeletivoModel,
    _data: string,
  ): ImpostoSeletivoDomain {
    const tratamentoTributario = this.tratamentoService.buscar(tratamentoClassificacao.idTratamentoTributario);

    const expressaoBaseCalculo = tratamentoTributario.expressaoBaseCalculo;
    const expressaoTributoCalculado = tratamentoTributario.expressaoTributoCalculado;
    const expressaoTributoDevido = tratamentoTributario.expressaoTributoDevido;

    const cst = item.impostoSeletivo!.cst;
    const cClassTrib = item.impostoSeletivo!.cClassTrib;
    const unidade = item.impostoSeletivo!.unidade;
    const baseCalculoInformada = item.impostoSeletivo!.baseCalculo;
    const quantidade = item.impostoSeletivo!.quantidade;
    const impostoSeletivoInformado = item.impostoSeletivo!.getValorImpostoSeletivoInformado();
    const impostoSeletivoCalculado = JBD.ZERO;

    let valorAliquotaAdValorem = aliquotaImpostoSeletivo.aliquotaAdValorem;
    if (valorAliquotaAdValorem !== null) {
      valorAliquotaAdValorem = dividirPorCem(valorAliquotaAdValorem);
    }
    const valorAliquotaAdRem = aliquotaImpostoSeletivo.aliquotaAdRem;

    let resultadoAliquota: JBD | null = null;
    let resultadoAliquotaEfetiva: JBD | null = null;

    const base2 = [
      entry("quantidade", quantidade),
      entry("aliquota", resultadoAliquota),
      entry("aliquotaEfetiva", resultadoAliquotaEfetiva),
      entry("baseCalculoInformada", baseCalculoInformada),
      entry("impostoSeletivoInformado", impostoSeletivoInformado),
      entry("impostoSeletivoCalculado", impostoSeletivoCalculado),
      entry("percentualReducao", null),
      entry("aliquotaPadraoOuReferencia", null),
      entry("aliquotaReferencia", null),
      entry("aliquotaAdValorem", valorAliquotaAdValorem),
      entry("aliquotaAdRem", valorAliquotaAdRem),
      entry("ajuste", null),
      entry("redutor", null),
    ];
    const resultadoBaseCalculo = this.avaliador.evaluate(expressaoBaseCalculo!, new Map(base2));

    const base3 = [
      entry("quantidade", quantidade),
      entry("baseCalculo", resultadoBaseCalculo),
      entry("aliquota", resultadoAliquota),
      entry("aliquotaEfetiva", resultadoAliquotaEfetiva),
      entry("baseCalculoInformada", baseCalculoInformada),
      entry("impostoSeletivoInformado", impostoSeletivoInformado),
      entry("impostoSeletivoCalculado", impostoSeletivoCalculado),
      entry("percentualReducao", null),
      entry("aliquotaPadraoOuReferencia", null),
      entry("aliquotaReferencia", null),
      entry("aliquotaAdValorem", valorAliquotaAdValorem),
      entry("aliquotaAdRem", valorAliquotaAdRem),
      entry("ajuste", null),
      entry("redutor", null),
    ];
    const resultadoTributoCalculado = this.avaliador.evaluate(expressaoTributoCalculado!, new Map(base3));

    let resultadoTributoDevido: JBD | null = null;
    if (isNotBlank(expressaoTributoDevido)) {
      const base4 = [
        entry("tributoCalculado", resultadoTributoCalculado),
        ...base3,
      ];
      resultadoTributoDevido = this.avaliador.evaluate(expressaoTributoDevido!, new Map(base4));
    }

    return {
      CSTIS: cst,
      cClassTribIS: cClassTrib,
      qTrib: quantidade,
      uTrib: unidade,
      vIS: resultadoTributoDevido,
      pIS: valorAliquotaAdValorem !== null ? valorAliquotaAdValorem.movePointRight(2) : valorAliquotaAdValorem,
      pISEspec: valorAliquotaAdRem,
      adRemIS: valorAliquotaAdRem,
      vBCIS: resultadoBaseCalculo,
      memoriaCalculo: null,
    };
  }
}
