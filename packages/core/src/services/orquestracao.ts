/**
 * Orquestração de item, operação e observabilidade — porte fiel de
 * ProcessamentoItemService, CalculadoraService e ObservabilidadeService.
 */
import {
  AliquotaImpostoSeletivoNaoInformadaException,
  AliquotasNominaisInformadasIndevidamenteException,
  AliquotasNominaisNaoInformadasException,
  BaseCalculoComponentesInconsistenteException,
  BaseCalculoInconsistenteException,
  BaseCalculoMenorBaseCalculoImpostoSeletivoException,
  BaseCalculoNaoInformadaException,
  ClassificacaoTributariaNaoVinculadaSituacaoTributariaException,
  DataFatoGeradorNaoInformadaException,
  ErroGenericoValidacaoException,
  ImpostoSeletivoNaoAdmitidoTipoDfeException,
  ImpostoSeletivoNaoInformadoException,
  IncompatibilidadeSuspensaoException,
  NegocioException,
  NcmNaoEncontradaException,
  NcmNbsSimultaneasException,
  NbsNaoEncontradaException,
  TributacaoRegularNaoInformadaException,
} from "../errors.js";
import { JBD, arredondarInterno } from "../model/jbd.js";
import {
  CompraGovernamentalDomain,
  type BaseCalculoNatureza,
  ObjetoDomain,
  Tributo,
  impostoSeletivoAplicavel,
  normalizarSigla,
  type AliquotaImpostoSeletivoModel,
  type ClassificacaoTributariaDTO,
  type ComponentesBaseCalculoInput,
  type ItemOperacaoInput,
  type OperacaoInput,
  type OperacaoModel,
  type TipoDfe,
  type TratamentoClassificacaoDTO,
  type TratamentoClassificacaoModel,
  type TributosDomain,
  type ValoresTotaisDomain,
} from "../model/types.js";
import {
  AliquotaAdRemProdutoService,
  AliquotaAdValoremProdutoService,
  AliquotaAdValoremServicoService,
  ClassificacaoTributariaService,
  MunicipioService,
  NcmAplicavelService,
  NcmService,
  NbsAplicavelService,
  NbsService,
  RedutorCompraGovernamentalService,
  SituacaoTributariaService,
  TipoDfeClassificacaoService,
  TipoDfeService,
  TratamentoClassificacaoService,
  UfService,
  ValidacaoNomenclaturaService,
} from "./support.js";
import { BaseCalculoUnificadaService } from "./calculo.js";
import { CalculoTributoService } from "./calculadora.js";
import { criarTotais } from "./totais.js";
import { type ItemViolacao, validarItem, validarOperacaoCamposGlobais } from "../validation.js";

const isBlank = (s: string | null | undefined): boolean => s === null || s === undefined || s.trim() === "";
const isNotBlank = (s: string | null | undefined): boolean => !isBlank(s);
const ANO_LIMITE_SUPERIOR_ALIQUOTAS_NOMINAIS = 2027;

// ─── ProcessamentoItemService ────────────────────────────────────────────────

export class ProcessamentoItemService {
  constructor(
    private readonly calculoTributoService: CalculoTributoService,
    private readonly tratamentoClassificacaoService: TratamentoClassificacaoService,
    private readonly classificacaoTributariaService: ClassificacaoTributariaService,
    private readonly ufService: UfService,
    private readonly aliquotaAdValoremProdutoService: AliquotaAdValoremProdutoService,
    private readonly aliquotaAdRemProdutoService: AliquotaAdRemProdutoService,
    private readonly aliquotaAdValoremServicoService: AliquotaAdValoremServicoService,
    private readonly ncmAplicavelService: NcmAplicavelService,
    private readonly nbsAplicavelService: NbsAplicavelService,
    private readonly tipoDfeClassificacaoService: TipoDfeClassificacaoService,
    private readonly validacaoNomenclaturaService: ValidacaoNomenclaturaService,
    private readonly ncmService: NcmService,
    private readonly nbsService: NbsService,
    private readonly situacaoTributariaService: SituacaoTributariaService,
    private readonly redutorCompraGovService: RedutorCompraGovernamentalService,
    private readonly baseCalculoUnificadaService: BaseCalculoUnificadaService,
  ) {}

  processarItem(operacao: OperacaoInput, item: ItemOperacaoInput, data: string, tipoDfe: TipoDfe | null = null): TributosDomain {
    // Defaults de quantidade/unidade (bloco "para a plataforma" do original)
    let itemAtual = item;
    if (itemAtual.quantidade === null) itemAtual = itemAtual.withDefaults(JBD.ONE, itemAtual.unidade ?? "UN");
    if (itemAtual.unidade === null) itemAtual = itemAtual.withDefaults(itemAtual.quantidade!, "UN");

    const componentes = itemAtual.gComponentesBC;
    let baseCalculo = itemAtual.baseCalculo;

    if (componentes !== null && componentes.possuiComponentes()) {
      itemAtual = this.validarBaseCalculoComComponentes(operacao, itemAtual, componentes);
      baseCalculo = itemAtual.baseCalculo;
    }

    if (componentes === null || !componentes.possuiComponentes()) {
      itemAtual = this.validarBaseCalculoLegado(itemAtual);
      baseCalculo = itemAtual.baseCalculo;
    }

    this.validarNcmNbs(itemAtual.ncm, itemAtual.nbs, data);
    this.situacaoTributariaService.validarCst(itemAtual.cst, Tributo.CBS, data);
    this.validarAliquotasNominais(itemAtual, data);

    const tratamentoClassificacao = this.obterTratamentoClassificacao(itemAtual, data, tipoDfe);
    const codigoUf = this.ufService.buscar(operacao.uf!);

    const operacaoModel: OperacaoModel = {
      data,
      codigoMunicipio: operacao.municipio,
      codigoUf,
      ncm: itemAtual.ncm,
      nbs: itemAtual.nbs,
      tpEnteGov: operacao.tpEnteGov,
      pRedutor: this.redutorCompraGovService.buscarValorRedutor(operacao.tpEnteGov ?? null, data),
      item: itemAtual,
      tratamentoClassificacao,
    };
    return this.calculoTributoService.calcular(operacaoModel);
  }

  private obterTratamentoClassificacao(item: ItemOperacaoInput, data: string, tipoDfe: TipoDfe | null): TratamentoClassificacaoModel {
    let classificacaoTributariaCbsIbs: ClassificacaoTributariaDTO | null = null;
    let classificacaoTributariaImpostoSeletivo: ClassificacaoTributariaDTO | null = null;
    let tratamentoClassificacaoCbsIbs: TratamentoClassificacaoDTO | null = null;
    let tratamentoClassificacaoImpostoSeletivo: TratamentoClassificacaoDTO | null = null;
    let tratamentoClassificacaoCbsIbsDesoneracao: TratamentoClassificacaoDTO | null = null;

    let cst: string | null = null;
    let cClassTrib: string | null = null;
    let temDesoneracao = false;
    const ncm = item.ncm;
    const nbs = item.nbs;

    classificacaoTributariaCbsIbs = this.classificacaoTributariaService.buscarClassificacaoTributariaCbsIbs(item.cClassTrib, data);
    this.validarClassificacaoTributariaCbsIbs(classificacaoTributariaCbsIbs, item.cst, ncm, nbs);
    this.validarVinculoTipoDfe(tipoDfe, classificacaoTributariaCbsIbs, data);
    tratamentoClassificacaoCbsIbs = this.tratamentoClassificacaoService.buscarTratamentoClassificacao(classificacaoTributariaCbsIbs.id, data);

    cst = item.cst;
    cClassTrib = item.cClassTrib;

    if (tratamentoClassificacaoCbsIbs.inExigeGrupoDesoneracao === 1) {
      if (item.tributacaoRegular === null) {
        throw new TributacaoRegularNaoInformadaException(cClassTrib!, cst!);
      }
      cst = item.tributacaoRegular.cst;
      cClassTrib = item.tributacaoRegular.cClassTrib;
      tratamentoClassificacaoCbsIbsDesoneracao = tratamentoClassificacaoCbsIbs;
      classificacaoTributariaCbsIbs = this.classificacaoTributariaService.buscarClassificacaoTributariaCbsIbs(cClassTrib, data);
      this.validarClassificacaoTributariaCbsIbs(classificacaoTributariaCbsIbs, cst, ncm, nbs);
      this.validarVinculoTipoDfe(tipoDfe, classificacaoTributariaCbsIbs, data);
      tratamentoClassificacaoCbsIbs = this.tratamentoClassificacaoService.buscarTratamentoClassificacao(classificacaoTributariaCbsIbs.id, data);
      if (tratamentoClassificacaoCbsIbs.inIncompativelComSuspensao === 1) {
        throw new IncompatibilidadeSuspensaoException(cClassTrib!, cst!);
      }
      temDesoneracao = true;
    } else if (item.tributacaoRegular !== null) {
      if (tipoDfe !== null) {
        const cl = this.classificacaoTributariaService.buscarClassificacaoTributariaCbsIbs(item.tributacaoRegular.cClassTrib, data);
        this.validarVinculoTipoDfe(tipoDfe, cl, data);
      }
    }

    if (tipoDfe !== null) {
      // Modo PERMISSIVO fixado neste call site (PARITY)
      this.validacaoNomenclaturaService.validar(
        normalizarSigla(tipoDfe.sigla),
        classificacaoTributariaCbsIbs.id,
        classificacaoTributariaCbsIbs.codigo,
        ncm,
        nbs,
        data,
        "CBS e IBS",
        false,
      );
    } else {
      if (isBlank(ncm) && isBlank(nbs)) {
        this.ncmAplicavelService.validarNcmAplicavel(ncm, classificacaoTributariaCbsIbs.id, classificacaoTributariaCbsIbs.codigo, data, "CBS e IBS");
        this.nbsAplicavelService.validarNbsAplicavel(nbs, classificacaoTributariaCbsIbs.id, classificacaoTributariaCbsIbs.codigo, data, "CBS e IBS");
      }
      if (isNotBlank(ncm) && isBlank(nbs)) {
        this.ncmAplicavelService.validarNcmAplicavel(ncm, classificacaoTributariaCbsIbs.id, classificacaoTributariaCbsIbs.codigo, data, "CBS e IBS");
      }
      if (isNotBlank(nbs) && isBlank(ncm)) {
        this.nbsAplicavelService.validarNbsAplicavel(nbs, classificacaoTributariaCbsIbs.id, classificacaoTributariaCbsIbs.codigo, data, "CBS e IBS");
      }
    }

    const aliquotaImpostoSeletivo = this.analisarAliquotaImpostoSeletivo(item, data);

    if (tipoDfe !== null && !impostoSeletivoAplicavel(tipoDfe.sigla) && aliquotaImpostoSeletivo !== null) {
      throw new ImpostoSeletivoNaoAdmitidoTipoDfeException(
        tipoDfe.tipo,
        isNotBlank(ncm) ? "NCM" : "NBS",
        isNotBlank(ncm) ? ncm! : nbs!,
      );
    }

    if (aliquotaImpostoSeletivo === null && Number(data.slice(0, 4)) >= ANO_LIMITE_SUPERIOR_ALIQUOTAS_NOMINAIS && this.existeIncidenciaImpostoSeletivo(ncm, nbs, data)) {
      if (item.impostoSeletivo === null) {
        throw new ImpostoSeletivoNaoInformadoException(isNotBlank(ncm) ? "NCM" : "NBS", isNotBlank(ncm) ? ncm! : nbs!, data);
      }
      throw new AliquotaImpostoSeletivoNaoInformadaException(isNotBlank(ncm) ? "NCM" : "NBS", isNotBlank(ncm) ? ncm! : nbs!, data);
    }

    if (aliquotaImpostoSeletivo !== null) {
      if (item.impostoSeletivo === null) {
        throw new ImpostoSeletivoNaoInformadoException(isNotBlank(ncm) ? "NCM" : "NBS", isNotBlank(ncm) ? ncm! : nbs!, data);
      }
      this.validarQuantidadeEUnidade(item, aliquotaImpostoSeletivo);
      this.situacaoTributariaService.validarCst(item.impostoSeletivo.cst ?? "", Tributo.IS, data);
      classificacaoTributariaImpostoSeletivo = this.classificacaoTributariaService.buscarClassificacaoTributariaImpostoSeletivo(item.impostoSeletivo.cClassTrib ?? "", data);
      if (classificacaoTributariaImpostoSeletivo.cst !== item.impostoSeletivo.cst) {
        throw new ClassificacaoTributariaNaoVinculadaSituacaoTributariaException(
          classificacaoTributariaImpostoSeletivo.codigo,
          item.impostoSeletivo.cst ?? "",
          "Imposto Seletivo",
        );
      }
      tratamentoClassificacaoImpostoSeletivo = this.tratamentoClassificacaoService.buscarTratamentoClassificacao(classificacaoTributariaImpostoSeletivo.id, data);
    }

    return {
      tratamentoClassificacaoCbsIbs,
      tratamentoClassificacaoImpostoSeletivo,
      tratamentoClassificacaoCbsIbsDesoneracao,
      aliquotaImpostoSeletivo,
      temDesoneracao,
    };
  }

  private validarVinculoTipoDfe(tipoDfe: TipoDfe | null, classificacaoTributaria: ClassificacaoTributariaDTO, data: string): void {
    if (tipoDfe === null) return;
    this.tipoDfeClassificacaoService.validarVinculo(tipoDfe, classificacaoTributaria.id, classificacaoTributaria.codigo, data, "CBS e IBS");
  }

  private validarBaseCalculoComComponentes(operacao: OperacaoInput, item: ItemOperacaoInput, componentes: ComponentesBaseCalculoInput): ItemOperacaoInput {
    const tpDoc = operacao.tpDoc;
    const natureza = this.inferirNatureza(item);
    const ano = Number(operacao.getFatoGeradorAplicavel().slice(0, 4));

    const resultado = this.baseCalculoUnificadaService.calcular(componentes, ano, natureza, tpDoc);

    const impostoSeletivo = item.impostoSeletivo;
    if (impostoSeletivo !== null) {
      const bcCalculada = resultado.baseIS;
      if (bcCalculada.isNegative()) {
        throw new ErroGenericoValidacaoException("A base de cálculo do Imposto Seletivo calculada a partir dos componentes é negativa");
      }
      const baseDeclarada = impostoSeletivo.baseCalculo;
      if (baseDeclarada !== null && baseDeclarada.compareTo(arredondarInterno(bcCalculada)!) !== 0) {
        throw new BaseCalculoComponentesInconsistenteException(baseDeclarada.toString(), bcCalculada.toString());
      }
      if (baseDeclarada === null) {
        const novoIs = new (item.impostoSeletivo!.constructor as any)(impostoSeletivo.cst, impostoSeletivo.cClassTrib, bcCalculada, impostoSeletivo.quantidade, impostoSeletivo.unidade, impostoSeletivo.impostoInformado);
        return item.withImpostoSeletivo(novoIs);
      }
      return item;
    }

    const bcCalculada = resultado.baseRG;
    if (bcCalculada.isNegative()) {
      throw new ErroGenericoValidacaoException("A base de cálculo calculada a partir dos componentes é negativa");
    }
    const baseDeclarada = item.baseCalculo;
    if (baseDeclarada !== null && baseDeclarada.compareTo(arredondarInterno(bcCalculada)!) !== 0) {
      throw new BaseCalculoComponentesInconsistenteException(baseDeclarada.toString(), bcCalculada.toString());
    }
    if (baseDeclarada === null) {
      return item.withBaseCalculo(bcCalculada);
    }
    return item;
  }

  private inferirNatureza(item: ItemOperacaoInput): BaseCalculoNatureza | null {
    const possuiNcm = isNotBlank(item.ncm);
    const possuiNbs = isNotBlank(item.nbs);
    if (possuiNcm && possuiNbs) return null;
    if (possuiNcm) return "BEM";
    if (possuiNbs) return "SERVICO";
    return null;
  }

  private validarBaseCalculoLegado(item: ItemOperacaoInput): ItemOperacaoInput {
    const impostoSeletivo = item.impostoSeletivo;
    const baseCalculo = item.baseCalculo;

    if (impostoSeletivo === null) {
      if (baseCalculo === null) throw new BaseCalculoNaoInformadaException();
      return item;
    }

    const baseCalculoImpostoSeletivo = impostoSeletivo.baseCalculo;
    if (baseCalculoImpostoSeletivo === null) {
      throw new ErroGenericoValidacaoException("A base de cálculo do Imposto Seletivo deve ser informada quando o grupo de Imposto Seletivo é informado");
    }
    const impostoInformado = impostoSeletivo.impostoInformado;

    if (baseCalculo === null) {
      return item.withBaseCalculo(
        arredondarInterno(baseCalculoImpostoSeletivo.add(impostoSeletivo.getValorImpostoSeletivoInformado()))!,
      );
    }

    if (impostoInformado !== null) {
      if (baseCalculo.compareTo(baseCalculoImpostoSeletivo.add(impostoInformado)) !== 0) {
        throw new BaseCalculoInconsistenteException(baseCalculo.toString(), baseCalculoImpostoSeletivo.toString(), impostoInformado.toString());
      }
    } else if (baseCalculo.compareTo(baseCalculoImpostoSeletivo) < 0) {
      throw new BaseCalculoMenorBaseCalculoImpostoSeletivoException(baseCalculo.toString(), baseCalculoImpostoSeletivo.toString());
    }
    return item;
  }

  private validarQuantidadeEUnidade(item: ItemOperacaoInput, aliquotaImpostoSeletivo: AliquotaImpostoSeletivoModel): void {
    if (aliquotaImpostoSeletivo.aliquotaAdRem !== null && item.impostoSeletivo !== null) {
      if (item.impostoSeletivo.quantidade === null) {
        throw new ErroGenericoValidacaoException("A quantidade do Imposto Seletivo deve ser informada para alíquota ad rem");
      }
      if (item.impostoSeletivo.quantidade.compareTo(JBD.ZERO) <= 0) {
        throw new ErroGenericoValidacaoException("A quantidade do Imposto Seletivo deve ser maior do que zero para alíquota ad rem");
      }
      if (item.impostoSeletivo.unidade === null) {
        throw new ErroGenericoValidacaoException("A unidade de medida do Imposto Seletivo deve ser informada para alíquota ad rem");
      }
    }
    if (item.quantidade !== null && item.quantidade.compareTo(JBD.ZERO) <= 0) {
      throw new ErroGenericoValidacaoException("A quantidade do item deve ser maior do que zero");
    }
  }

  private validarAliquotasNominais(item: ItemOperacaoInput, data: string): void {
    const ano = Number(data.slice(0, 4));
    if (ano < ANO_LIMITE_SUPERIOR_ALIQUOTAS_NOMINAIS) {
      if (informouAliquotasNominais(item.aliquotasNominais)) {
        throw new AliquotasNominaisInformadasIndevidamenteException();
      }
      return;
    }
    const situacaoTributaria = this.situacaoTributariaService.consultarSituacaoTributariaPorCodigo(item.cst, Tributo.CBS, data);
    const cstExigeGrupo = situacaoTributaria !== null && situacaoTributaria.inGrupoIbsCbs === 1;
    if (!cstExigeGrupo) return;
    const aliquotas = item.aliquotasNominais;
    if (aliquotas === null || aliquotas.cbs === null || aliquotas.ibsEstadual === null || aliquotas.ibsMunicipal === null) {
      throw new AliquotasNominaisNaoInformadasException();
    }
  }

  private existeIncidenciaImpostoSeletivo(ncm: string | null, nbs: string | null, data: string): boolean {
    if (isNotBlank(ncm) && ncm!.length === 8) {
      return (
        this.aliquotaAdValoremProdutoService.existeNcmAdValorem(ncm!, Tributo.IS, data) ||
        this.aliquotaAdRemProdutoService.buscarAliquotaAdRem(ncm!, Tributo.IS, data) !== null
      );
    }
    if (isNotBlank(nbs) && nbs!.length === 9) {
      return this.aliquotaAdValoremServicoService.existeNbsAdValorem(nbs!, Tributo.IS, data);
    }
    return false;
  }

  private analisarAliquotaImpostoSeletivo(item: ItemOperacaoInput, data: string): AliquotaImpostoSeletivoModel | null {
    const ncm = item.ncm;
    const nbs = item.nbs;

    const aliquotasInformadas = item.aliquotasNominais?.impostoSeletivo ?? null;
    const possuiAliquotaAdRemInformada = aliquotasInformadas !== null && aliquotasInformadas.adRem !== null;

    if (possuiAliquotaAdRemInformada && isBlank(item.impostoSeletivo?.unidade ?? null)) {
      throw new ErroGenericoValidacaoException(
        "A unidade de medida do Imposto Seletivo deve ser informada quando a alíquota ad rem é informada pelo usuário",
      );
    }

    let aliquotaAdValorem = aliquotasInformadas !== null ? aliquotasInformadas.adValorem : null;
    let aliquotaAdRem = aliquotasInformadas !== null ? aliquotasInformadas.adRem : null;
    let unidadeMedida = aliquotaAdRem !== null ? item.impostoSeletivo!.unidade : null;

    if (isNotBlank(ncm) && ncm!.length === 8) {
      if (aliquotaAdValorem === null) {
        const dto = this.aliquotaAdValoremProdutoService.buscarAliquotaAdValorem(ncm!, Tributo.IS, data);
        if (dto !== null) aliquotaAdValorem = dto.valor;
      }
      if (aliquotaAdRem === null) {
        const dto = this.aliquotaAdRemProdutoService.buscarAliquotaAdRem(ncm!, Tributo.IS, data);
        if (dto !== null) {
          aliquotaAdRem = dto.valor;
          unidadeMedida = dto.unidadeMedida;
        }
      }
    } else if (isNotBlank(nbs) && nbs!.length === 9) {
      if (aliquotaAdValorem === null) {
        aliquotaAdValorem = this.aliquotaAdValoremServicoService.buscarAliquotaAdValorem(nbs!, Tributo.IS, null, data);
      }
    }

    if (aliquotaAdValorem !== null || aliquotaAdRem !== null) {
      return { aliquotaAdValorem, aliquotaAdRem, unidadeMedida };
    }
    return null;
  }

  private validarClassificacaoTributariaCbsIbs(classificacaoTributaria: ClassificacaoTributariaDTO, cst: string, ncm: string | null, nbs: string | null): void {
    if (isBlank(ncm) && isBlank(nbs)) return;
    if (classificacaoTributaria.cst !== cst) {
      throw new ClassificacaoTributariaNaoVinculadaSituacaoTributariaException(classificacaoTributaria.codigo, cst, "CBS e IBS");
    }
  }

  private validarNcmNbs(ncm: string | null, nbs: string | null, data: string): void {
    if (isNotBlank(ncm) && isNotBlank(nbs)) throw new NcmNbsSimultaneasException();
    if (isNotBlank(ncm) && !this.ncmService.existeNcm(ncm!, data)) throw new NcmNaoEncontradaException(ncm!, data);
    if (isNotBlank(nbs) && !this.nbsService.existeNbs(nbs!, data)) throw new NbsNaoEncontradaException(nbs!, data);
  }
}

function informouAliquotasNominais(aliquotas: OperacaoInput["itens"][number]["aliquotasNominais"]): boolean {
  if (aliquotas === null) return false;
  const is = aliquotas.impostoSeletivo;
  return (
    aliquotas.cbs !== null ||
    aliquotas.ibsEstadual !== null ||
    aliquotas.ibsMunicipal !== null ||
    (is !== null && (is.adValorem !== null || is.adRem !== null))
  );
}

// ─── CalculadoraService ──────────────────────────────────────────────────────

export interface CalculadoraHeaderExtras {
  /** true quando alguma alíquota ainda não definida em law foi simulada */
  simulado: boolean;
}

export class CalculadoraService {
  constructor(
    private readonly ufService: UfService,
    private readonly municipioService: MunicipioService,
    private readonly redutorCompraGovService: RedutorCompraGovernamentalService,
    private readonly tipoDfeService: TipoDfeService,
    private readonly processamentoItemService: ProcessamentoItemService,
    private readonly totaisFactory: (objetos: ObjetoDomain[]) => ValoresTotaisDomain | null,
  ) {}

  calcularTributos(operacao: OperacaoInput): { roc: ObjetoDomain[]; total: ValoresTotaisDomain | null; oper: unknown } {
    if (operacao.uf === null || operacao.uf === undefined) {
      const uf = this.municipioService.buscarUfPorMunicipio(operacao.municipio);
      operacao = withUf(operacao, uf);
    }
    this.ufService.validarUf(operacao.uf!);
    this.municipioService.validarMunicipio(operacao.municipio, operacao.uf!);

    const tipoDfe = this.tipoDfeService.buscarPorTipo(operacao.tpDoc, operacao.getFatoGeradorAplicavel());
    const data = operacao.getFatoGeradorAplicavel();

    const objetos = operacao.itens
      .map((item) => {
        const tribCalc = this.processamentoItemService.processarItem(operacao, item, data, tipoDfe);
        return new ObjetoDomain(item.numero, tribCalc, item.aliquotasNominais !== null);
      })
      .sort((a, b) => a.nObj - b.nObj);

    return { roc: objetos, total: this.totaisFactory(objetos), oper: this.getOperacaoOutput(operacao) };
  }

  private getOperacaoOutput(op: OperacaoInput): unknown {
    if (op.gCompraGov === null) return null;
    return {
      gCompraGov: new CompraGovernamentalDomain(
        op.gCompraGov.tpEnteGov,
        this.redutorCompraGovService.buscarValorRedutor(op.tpEnteGov ?? null, op.getFatoGeradorAplicavel()),
        op.gCompraGov.tpOperGov,
      ),
    };
  }
}

function withUf(operacao: OperacaoInput, uf: string): OperacaoInput {
  return Object.create(Object.getPrototypeOf(operacao), {
    ...Object.getOwnPropertyDescriptors(operacao),
    uf: { value: uf, enumerable: true, writable: false },
  }) as OperacaoInput;
}

// ─── Observabilidade ─────────────────────────────────────────────────────────

export interface ErroDetalhe {
  type: string;
  title: string;
  code: string;
  pointer: string;
  detail: string;
}

export interface ObservabilidadeItemDomain {
  nObj: number;
  estadoItem: string;
  tribCalc?: TributosDomain;
  erros?: ErroDetalhe[];
}

export class ErrosCalculoException extends Error {
  constructor(readonly erros: ErroDetalhe[]) {
    super("Erros de cálculo detectados");
    this.name = "ErrosCalculoException";
  }
}

/** CodigoValidacao — códigos VAL-xxx por anotação Bean Validation. */
const CODIGO_VALIDACAO: Record<string, { code: string; title: string }> = {
  NotNull: { code: "VAL-001", title: "Campo obrigatório não informado" },
  NotBlank: { code: "VAL-002", title: "Campo obrigatório em branco" },
  NotEmpty: { code: "VAL-003", title: "Lista ou campo não pode estar vazio" },
  Size: { code: "VAL-004", title: "Tamanho fora do intervalo permitido" },
  Min: { code: "VAL-005", title: "Valor abaixo do mínimo permitido" },
  Max: { code: "VAL-006", title: "Valor acima do máximo permitido" },
  DecimalMin: { code: "VAL-007", title: "Valor decimal abaixo do mínimo permitido" },
  DecimalMax: { code: "VAL-008", title: "Valor decimal acima do máximo permitido" },
  Pattern: { code: "VAL-009", title: "Formato inválido" },
  Digits: { code: "VAL-010", title: "Quantidade de dígitos inválida" },
  Email: { code: "VAL-011", title: "E-mail inválido" },
  Positive: { code: "VAL-012", title: "Valor deve ser positivo" },
  PositiveOrZero: { code: "VAL-013", title: "Valor deve ser positivo ou zero" },
  AssertTrue: { code: "VAL-014", title: "Condição não atendida" },
  AssertFalse: { code: "VAL-015", title: "Condição atendida indevidamente" },
};
const DESCONHECIDO = { code: "VAL-000", title: "Erro de validação não categorizado" };

export class ObservabilidadeService {
  constructor(
    private readonly processamentoItemService: ProcessamentoItemService,
    private readonly ufService: UfService,
    private readonly municipioService: MunicipioService,
    private readonly redutorCompraGovService: RedutorCompraGovernamentalService,
    private readonly tipoDfeService: TipoDfeService,
    private readonly totaisFactory: (objetos: ObjetoDomain[]) => ValoresTotaisDomain | null,
  ) {}

  processarOperacao(operacao: OperacaoInput, baseURL: string) {
    // 1. Bean Validation dos campos globais
    const errosGlobais = this.validarCamposGlobais(operacao, baseURL);
    if (errosGlobais.length > 0) throw new ErrosCalculoException(errosGlobais);

    let data: string;
    let tipoDfe: TipoDfe | null;
    let oper = operacao;
    try {
      if (oper.uf === null || oper.uf === undefined) {
        oper = withUf(oper, this.municipioService.buscarUfPorMunicipio(oper.municipio));
      }
      this.ufService.validarUf(oper.uf!);
      this.municipioService.validarMunicipio(oper.municipio, oper.uf!);
      data = oper.getFatoGeradorAplicavel();
      tipoDfe = this.tipoDfeService.buscarPorTipo(oper.tpDoc, data);
    } catch (ex) {
      const collector = new ItemCollector(-1, baseURL);
      collector.addErro(ex as Error);
      throw new ErrosCalculoException(collector.erros);
    }

    const resultados: ObservabilidadeItemDomain[] = oper.itens.map((item, index) =>
      this.processarItemComValidacao(oper, item, index, data, tipoDfe, baseURL),
    );
    resultados.sort((a, b) => a.nObj - b.nObj);

    const itensCalculados = resultados
      .filter((r) => r.estadoItem === "CALCULADO" || r.estadoItem === "CALCULO_SIMULADO")
      .map((r) => new ObjetoDomain(r.nObj, r.tribCalc ?? null, false));

    const total = itensCalculados.length === 0 ? null : this.totaisFactory(itensCalculados);
    return { oper: this.getOperacaoOutput(oper), objetos: resultados, total };
  }

  private getOperacaoOutput(op: OperacaoInput): unknown {
    if (op.gCompraGov === null) return null;
    return {
      gCompraGov: new CompraGovernamentalDomain(
        op.gCompraGov.tpEnteGov,
        this.redutorCompraGovService.buscarValorRedutor(op.tpEnteGov ?? null, op.getFatoGeradorAplicavel()),
        op.gCompraGov.tpOperGov,
      ),
    };
  }

  private processarItemComValidacao(
    operacao: OperacaoInput,
    item: ItemOperacaoInput,
    index: number,
    data: string,
    tipoDfe: TipoDfe | null,
    baseURL: string,
  ): ObservabilidadeItemDomain {
    const collector = new ItemCollector(index, baseURL);
    const violacoes = validarItem(item);
    for (const v of violacoes) {
      collector.addErroValidacao(v);
    }
    if (collector.hasErros()) {
      return { nObj: item.numero ?? index + 1, estadoItem: collector.estado, erros: collector.erros };
    }
    try {
      const tributos = this.processamentoItemService.processarItem(operacao, item, data, tipoDfe);
      return {
        nObj: item.numero ?? index + 1,
        estadoItem: item.aliquotasNominais === null ? "CALCULADO" : "CALCULO_SIMULADO",
        tribCalc: tributos,
      };
    } catch (ex) {
      collector.addErro(ex as Error);
      return { nObj: item.numero ?? index + 1, estadoItem: collector.estado, erros: collector.erros };
    }
  }

  private validarCamposGlobais(operacao: OperacaoInput, baseURL: string): ErroDetalhe[] {
    const collector = new ItemCollector(-1, baseURL);
    for (const v of validarOperacaoCamposGlobais(operacao)) {
      collector.addErroValidacao(v);
    }
    return collector.erros;
  }
}

/** ItemCollector — acumula ErroDetalhe por item com estado. */
export class ItemCollector {
  readonly erros: ErroDetalhe[] = [];
  estado = "CALCULADO";

  constructor(private readonly index: number, private readonly baseURL: string) {}

  addErroValidacao(v: ItemViolacao): void {
    if (this.estado === "CALCULADO") this.estado = "INCONSISTENCIA_ENTRADA";
    const meta = CODIGO_VALIDACAO[v.anotacao] ?? DESCONHECIDO;
    this.erros.push({
      type: this.buildTypeURI(meta.code),
      title: meta.title,
      code: meta.code,
      pointer: this.buildPointer(v.campo),
      detail: v.mensagem,
    });
  }

  addErro(ex: Error): void {
    if (ex instanceof NegocioException) {
      this.estado = ex.estadoItem;
      this.erros.push({
        type: this.buildTypeURI(ex.codigo),
        title: ex.titulo,
        code: ex.codigo,
        pointer: this.buildPointer(ex.campo),
        detail: ex.message ?? "",
      });
    } else {
      this.estado = "FALHA_TECNICA";
      this.erros.push({
        type: this.buildTypeURI("CAL-999"),
        title: "Erro interno do sistema",
        code: "CAL-999",
        pointer: this.buildPointer(null),
        detail: ex.message ?? "",
      });
    }
  }

  private buildTypeURI(codigo: string): string {
    return `${this.baseURL}/api/calculadora/observabilidade/erros?codigo=${codigo}`;
  }

  private buildPointer(campo: string | null): string {
    if (campo === null) return `#/itens/${this.index}`;
    return `#/itens/${this.index}/${campo}`;
  }

  hasErros(): boolean {
    return this.erros.length > 0;
  }
}
