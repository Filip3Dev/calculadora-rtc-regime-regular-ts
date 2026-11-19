/**
 * Orquestração — porte fiel de CalculoTributoService, ProcessamentoItemService,
 * CalculadoraService e ObservabilidadeService (com collectors).
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
  BaseCalculoNatureza,
  ObjetoDomain,
  Tributo,
  CBSDomain,
  type CbsIbsOutput,
  type ClassificacaoTributariaDTO,
  GrupoIBSCBSDomain,
  IBSMunDomain,
  IBSUFDomain,
  type GrupoEtapaMonofasiaOutput,
  IBSCBSDomain,
  type ImpostoSeletivoDomain,
  type ItemOperacaoInput,
  TributacaoRegularDomain as TribRegClass,
  type MonofasiaDiferimentoDomain,
  MonofasiaDomain,
  type MonofasiaPadraoDomain,
  type MonofasiaRetencaoDomain,
  type MonofasiaRetidoAnteriormenteDomain,
  type ObjetoDomain as Objeto,
  type OperacaoInput,
  type OperacaoModel,
  type ReducaoAliquotaDomain,
  type ROCDomain,
  type TipoDfe,
  type TipoEnteGovernamental,
  type TratamentoClassificacaoDTO,
  type TratamentoClassificacaoModel,
  TributacaoCompraGovernamentalDomain,
  type TributacaoRegularDomain,
  TributosDomain,
  type ValoresTotaisDomain,
} from "../model/types.js";
import {
  AliquotaAdRemProdutoService,
  AliquotaAdValoremProdutoService,
  AliquotaAdValoremServicoService,
  AliquotaPadraoService,
  AliquotaReferenciaService,
  ClassificacaoTributariaService,
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
} from "./support.js";
import { BaseCalculoUnificadaService, CalculoCbsIbsService, CalculoImpostoSeletivoService } from "./calculo.js";
import { normalizarSigla, impostoSeletivoAplicavel } from "../model/types.js";
import type { ItemViolacao } from "../validation.js";

const isBlank = (s: string | null | undefined): boolean => s === null || s === undefined || s.trim() === "";
const isNotBlank = (s: string | null | undefined): boolean => !isBlank(s);
const ANO_LIMITE_SUPERIOR_ALIQUOTAS_NOMINAIS = 2027;

// ─── CalculoTributoService ───────────────────────────────────────────────────

export class CalculoTributoService {
  constructor(
    private readonly calculoCbsIbsService: CalculoCbsIbsService,
    private readonly calculoImpostoSeletivoService: CalculoImpostoSeletivoService,
    private readonly memoriaCalculoService: MemoriaCalculoService,
    private readonly transferenciaService: TransferenciaCBSService,
    private readonly calculoIbsHabilitado: boolean,
  ) {}

  calcular(operacao: OperacaoModel): TributosDomain {
    const item = operacao.item;
    const data = operacao.data;
    const nbs = item.nbs;

    const tratamentoClassificacaoCbsIbs = operacao.tratamentoClassificacao.tratamentoClassificacaoCbsIbs;
    const tratamentoClassificacaoImpostoSeletivo = operacao.tratamentoClassificacao.tratamentoClassificacaoImpostoSeletivo;
    const temDesoneracao = operacao.tratamentoClassificacao.temDesoneracao;

    let tratamentoClassificacaoCbsIbsDesoneracao: TratamentoClassificacaoDTO | null = null;
    if (temDesoneracao) {
      tratamentoClassificacaoCbsIbsDesoneracao = operacao.tratamentoClassificacao.tratamentoClassificacaoCbsIbsDesoneracao;
    }
    const tratamentoClassificacao = temDesoneracao ? tratamentoClassificacaoCbsIbsDesoneracao : tratamentoClassificacaoCbsIbs;

    let impostoSeletivo: ImpostoSeletivoDomain | null = null;
    if (tratamentoClassificacaoImpostoSeletivo !== null) {
      const aliquotaImpostoSeletivo = operacao.tratamentoClassificacao.aliquotaImpostoSeletivo!;
      impostoSeletivo = this.calculoImpostoSeletivoService.calcularImpostoSeletivo(
        Tributo.IS,
        item,
        tratamentoClassificacaoImpostoSeletivo,
        aliquotaImpostoSeletivo,
        data,
      );
      this.memoriaCalculoService.gerarMemoriaCalculoImpostoSeletivo(
        tratamentoClassificacaoImpostoSeletivo,
        impostoSeletivo,
        item.impostoSeletivo!.quantidade,
        item.impostoSeletivo!.unidade,
        data,
      );
    }

    let cbs: CbsIbsOutput | null = null;
    let ibsEstadual: CbsIbsOutput | null = null;
    let ibsMunicipal: CbsIbsOutput | null = null;
    if (tratamentoClassificacaoCbsIbs !== null) {
      const impostoSeletivoCalculado = impostoSeletivo !== null ? (impostoSeletivo.vIS ?? JBD.ZERO) : JBD.ZERO;

      const calcularCbs = true;
      const calcularIbsEstadual =
        this.calculoIbsHabilitado || isNotBlank(nbs) || possuiAliquotaIbsInformada(item, Tributo.IBS_ESTADUAL);
      const calcularIbsMunicipal =
        this.calculoIbsHabilitado || isNotBlank(nbs) || possuiAliquotaIbsInformada(item, Tributo.IBS_MUNICIPAL);

      // PARITY: o original calcula em paralelo (CompletableFuture); aqui é
      // sequencial — mesma ordem de chamada, mesmos resultados.
      cbs = this.calcularCbsIbs(Tributo.CBS, null, null, item, tratamentoClassificacaoCbsIbs, impostoSeletivoCalculado, temDesoneracao, data, operacao, tratamentoClassificacao, calcularCbs);
      ibsEstadual = this.calcularCbsIbs(Tributo.IBS_ESTADUAL, operacao.codigoUf, null, item, tratamentoClassificacaoCbsIbs, impostoSeletivoCalculado, temDesoneracao, data, operacao, tratamentoClassificacao, calcularIbsEstadual);
      ibsMunicipal = this.calcularCbsIbs(Tributo.IBS_MUNICIPAL, null, operacao.codigoMunicipio, item, tratamentoClassificacaoCbsIbs, impostoSeletivoCalculado, temDesoneracao, data, operacao, tratamentoClassificacao, calcularIbsMunicipal);
    }

    const tributos = new TributosDomain();
    tributos.IS = impostoSeletivo;
    tributos.IBSCBS = this.getIBSCBS(item, cbs, ibsEstadual, ibsMunicipal, operacao.tpEnteGov, data);
    return tributos;
  }

  private calcularCbsIbs(
    tributo: Tributo,
    codigoUf: number | null,
    codigoMunicipio: number | null,
    item: ItemOperacaoInput,
    tratamentoClassificacaoCbsIbs: TratamentoClassificacaoDTO,
    impostoSeletivoCalculado: JBD,
    temDesoneracao: boolean,
    data: string,
    operacao: OperacaoModel,
    tratamentoClassificacao: TratamentoClassificacaoDTO | null,
    calcularTributo: boolean,
  ): CbsIbsOutput | null {
    if (!calcularTributo) return null;
    const output = this.calculoCbsIbsService.calcularCbsIbs(
      tributo,
      codigoUf,
      codigoMunicipio,
      item,
      tratamentoClassificacaoCbsIbs,
      impostoSeletivoCalculado,
      temDesoneracao,
      data,
      operacao.tpEnteGov,
      operacao.pRedutor,
    );
    this.memoriaCalculoService.gerarMemoriaCalculoCbsIbs(
      tratamentoClassificacao!,
      output,
      item.quantidade,
      item.unidade,
      data,
    );
    return output;
  }

  private getIBSCBS(
    item: ItemOperacaoInput,
    cbs: CbsIbsOutput | null,
    ibsEstadual: CbsIbsOutput | null,
    ibsMunicipal: CbsIbsOutput | null,
    tpEnteGov: TipoEnteGovernamental | null,
    dataFatoGerador: string,
  ): IBSCBSDomain {
    const monofasia = getMonofasia(cbs, ibsEstadual, ibsMunicipal);
    const domain = new IBSCBSDomain();
    domain.CST = item.cst;
    domain.cClassTrib = item.cClassTrib;
    domain.gIBSCBS = monofasia === null ? getGIBSCBS(cbs, ibsEstadual, ibsMunicipal, tpEnteGov, dataFatoGerador) : null;
    domain.gIBSCBSMono = monofasia;
    return domain;
  }
}

function possuiAliquotaIbsInformada(item: ItemOperacaoInput, tributo: Tributo): boolean {
  if (item.aliquotasNominais === null) return false;
  return tributo === Tributo.IBS_ESTADUAL
    ? item.aliquotasNominais.ibsEstadual !== null
    : tributo === Tributo.IBS_MUNICIPAL
      ? item.aliquotasNominais.ibsMunicipal !== null
      : false;
}

function getGIBSCBS(
  cbs: CbsIbsOutput | null,
  ibsEstadual: CbsIbsOutput | null,
  ibsMunicipal: CbsIbsOutput | null,
  tpEnteGov: TipoEnteGovernamental | null,
  dataFatoGerador: string,
) {
  if (cbs === null && ibsEstadual === null && ibsMunicipal === null) return null;

  const pTransferenciaCBS = new TransferenciaCBSServiceStub().getPercentualTransferencia(dataFatoGerador);
  const compraGovernamental = getCompraGovernamental(cbs, ibsEstadual, ibsMunicipal);
  const compraGovEfetiva =
    compraGovernamental === null
      ? null
      : compraGovernamental.getValoresEfetivos(tpEnteGov, pTransferenciaCBS, dataFatoGerador);

  trataImpactoCompraGovCBS(cbs, compraGovEfetiva);
  trataImpactoCompraGovIBSUF(ibsEstadual, compraGovEfetiva);
  trataImpactoCompraGovIBSMun(ibsMunicipal, compraGovEfetiva);

  const vBC = getVBC(ibsMunicipal, getVBC(ibsEstadual, getVBC(cbs, null)));
  const gIBSUF = getIBSUF(ibsEstadual);
  const gIBSMun = getIBSMun(ibsMunicipal);
  const vIBS = getVIbs(gIBSUF, gIBSMun);
  const gCBS = getCbs(cbs);
  const tributacaoRegular = getTributacaoRegular(cbs, ibsEstadual, ibsMunicipal);

  if (tributacaoRegular !== null && compraGovernamental !== null) {
    compraGovernamental.zerarValores();
  }

  const grupo = new GrupoIBSCBSDomain();
  grupo.vBC = vBC;
  grupo.gIBSUF = gIBSUF;
  grupo.gIBSMun = gIBSMun;
  grupo.vIBS = vIBS;
  grupo.gCBS = gCBS;
  grupo.gTribRegular = tributacaoRegular;
  grupo.gTribCompraGov = compraGovernamental;
  return grupo;
}

/** Stub injetável — TransferenciaCBSService real é ligado na montagem da calculadora. */
let transferenciaCBSProvider: ((data: string) => JBD) | null = null;
export function setTransferenciaCBSProvider(fn: (data: string) => JBD): void {
  transferenciaCBSProvider = fn;
}
class TransferenciaCBSServiceStub {
  getPercentualTransferencia(data: string): JBD {
    if (transferenciaCBSProvider === null) throw new Error("TransferenciaCBSProvider não configurado");
    return transferenciaCBSProvider(data);
  }
}

function getVBC(c: CbsIbsOutput | null, valor: JBD | null): JBD | null {
  if (valor !== null) return valor;
  if (c !== null) return c.baseCalculo;
  return null;
}

function getIBSUF(ibsEstadual: CbsIbsOutput | null) {
  if (ibsEstadual === null) return null;
  const ibsUF = new IBSUFDomain();
  ibsUF.pIBSUF = ibsEstadual.aliquota ?? JBD.ZERO;
  ibsUF.gDif = ibsEstadual.grupoDiferimento;
  ibsUF.gRed = ibsEstadual.grupoReducao;
  ibsUF.vIBSUF = ibsEstadual.tributoDevido ?? JBD.ZERO;
  ibsUF.memoriaCalculo = ibsEstadual.memoriaCalculo;
  return ibsUF;
}

function getIBSMun(ibsMunicipal: CbsIbsOutput | null) {
  if (ibsMunicipal === null) return null;
  const ibsMun = new IBSMunDomain();
  ibsMun.pIBSMun = ibsMunicipal.aliquota ?? JBD.ZERO;
  ibsMun.gDif = ibsMunicipal.grupoDiferimento;
  ibsMun.gRed = ibsMunicipal.grupoReducao;
  ibsMun.vIBSMun = ibsMunicipal.tributoDevido ?? JBD.ZERO;
  ibsMun.memoriaCalculo = ibsMunicipal.memoriaCalculo;
  return ibsMun;
}

function getCbs(cbsOut: CbsIbsOutput | null): CBSDomain | null {
  if (cbsOut === null) return null;
  const cbs = new CBSDomain();
  cbs.pCBS = cbsOut.aliquota ?? JBD.ZERO;
  cbs.gDif = cbsOut.grupoDiferimento;
  cbs.gRed = cbsOut.grupoReducao;
  cbs.vCBS = cbsOut.tributoDevido ?? JBD.ZERO;
  cbs.memoriaCalculo = cbsOut.memoriaCalculo;
  return cbs;
}

function getVIbs(ibsUF: { vIBSUF: JBD } | null, ibsMun: { vIBSMun: JBD } | null): JBD {
  return (ibsUF?.vIBSUF ?? JBD.ZERO).add(ibsMun?.vIBSMun ?? JBD.ZERO);
}

function getTributacaoRegular(
  cbs: CbsIbsOutput | null,
  ibsEstadual: CbsIbsOutput | null,
  ibsMunicipal: CbsIbsOutput | null,
): TributacaoRegularDomain | null {
  let builder: TributacaoRegularDomain | null = null;
  const cbsTr = cbs !== null && cbs.tributacaoRegular !== null ? cbs.tributacaoRegular : null;
  const ibsUfTr = ibsEstadual !== null && ibsEstadual.tributacaoRegular !== null ? ibsEstadual.tributacaoRegular : null;
  const ibsMunTr = ibsMunicipal !== null && ibsMunicipal.tributacaoRegular !== null ? ibsMunicipal.tributacaoRegular : null;
  const primeiro = cbsTr ?? ibsUfTr ?? ibsMunTr;
  if (primeiro === null) return null;
  builder = new TribRegClass();
  builder.CSTReg = primeiro.cst;
  builder.cClassTribReg = primeiro.cClassTrib;
  if (ibsUfTr !== null) {
    builder.pAliqEfetRegIBSUF = ibsUfTr.aliquotaEfetiva ?? JBD.ZERO;
    builder.vTribRegIBSUF = ibsUfTr.tributoDevido ?? JBD.ZERO;
  }
  if (ibsMunTr !== null) {
    builder.pAliqEfetRegIBSMun = ibsMunTr.aliquotaEfetiva ?? JBD.ZERO;
    builder.vTribRegIBSMun = ibsMunTr.tributoDevido ?? JBD.ZERO;
  }
  if (cbsTr !== null) {
    builder.pAliqEfetRegCBS = cbsTr.aliquotaEfetiva ?? JBD.ZERO;
    builder.vTribRegCBS = cbsTr.tributoDevido ?? JBD.ZERO;
  }
  return builder;
}

function getCompraGovernamental(
  cbs: CbsIbsOutput | null,
  ibsEstadual: CbsIbsOutput | null,
  ibsMunicipal: CbsIbsOutput | null,
): TributacaoCompraGovernamentalDomain | null {
  const possuiCBS = cbs !== null && cbs.possuiCompraGov();
  const possuiIBSUF = ibsEstadual !== null && ibsEstadual.possuiCompraGov();
  const possuiIBSMun = ibsMunicipal !== null && ibsMunicipal.possuiCompraGov();

  if (possuiCBS && possuiIBSUF && possuiIBSMun) {
    const b = new TributacaoCompraGovernamentalDomain();
    b.pAliqCBS = cbs!.compraGovernamental!.pAliqCBS;
    b.vTribCBS = cbs!.compraGovernamental!.vTribCBS;
    b.pAliqIBSUF = ibsEstadual!.compraGovernamental!.pAliqIBSUF;
    b.vTribIBSUF = ibsEstadual!.compraGovernamental!.vTribIBSUF;
    b.pAliqIBSMun = ibsMunicipal!.compraGovernamental!.pAliqIBSMun;
    b.vTribIBSMun = ibsMunicipal!.compraGovernamental!.vTribIBSMun;
    return b;
  }
  if (possuiCBS || possuiIBSUF || possuiIBSMun) {
    throw new Error("Erro ao consolidar valores de compras governamentais. Algum dos tributos não calculou compra governamental.");
  }
  return null;
}

function trataImpactoCompraGovCBS(cbs: CbsIbsOutput | null, compraGov: TributacaoCompraGovernamentalDomain | null): void {
  if (cbs !== null && compraGov !== null) {
    if (cbs.grupoReducao === null) {
      cbs.grupoReducao = { pRedAliq: JBD.ZERO, pAliqEfet: null };
    }
    const tr = cbs.tributacaoRegular;
    if (tr !== null) {
      cbs.grupoReducao.pRedAliq = JBD.ZERO;
      cbs.grupoReducao.pAliqEfet = JBD.ZERO;
      cbs.tributoDevido = JBD.ZERO;
      tr.aliquotaEfetiva = compraGov.pAliqCBS;
      tr.tributoDevido = compraGov.vTribCBS;
    } else {
      cbs.grupoReducao.pAliqEfet = compraGov.pAliqCBS;
      cbs.tributoDevido = compraGov.vTribCBS;
    }
  }
}

function trataImpactoCompraGovIBSUF(ibsUF: CbsIbsOutput | null, compraGov: TributacaoCompraGovernamentalDomain | null): void {
  if (ibsUF !== null && compraGov !== null) {
    if (ibsUF.grupoReducao === null) {
      ibsUF.grupoReducao = { pRedAliq: JBD.ZERO, pAliqEfet: null };
    }
    const tr = ibsUF.tributacaoRegular;
    if (tr !== null) {
      ibsUF.grupoReducao.pRedAliq = JBD.ZERO;
      ibsUF.grupoReducao.pAliqEfet = JBD.ZERO;
      ibsUF.tributoDevido = JBD.ZERO;
      tr.aliquotaEfetiva = compraGov.pAliqIBSUF;
      tr.tributoDevido = compraGov.vTribIBSUF;
    } else {
      ibsUF.grupoReducao.pAliqEfet = compraGov.pAliqIBSUF;
      ibsUF.tributoDevido = compraGov.vTribIBSUF;
    }
  }
}

function trataImpactoCompraGovIBSMun(ibsMun: CbsIbsOutput | null, compraGov: TributacaoCompraGovernamentalDomain | null): void {
  if (ibsMun !== null && compraGov !== null) {
    if (ibsMun.grupoReducao === null) {
      ibsMun.grupoReducao = { pRedAliq: JBD.ZERO, pAliqEfet: null };
    }
    const tr = ibsMun.tributacaoRegular;
    if (tr !== null) {
      ibsMun.grupoReducao.pRedAliq = JBD.ZERO;
      ibsMun.grupoReducao.pAliqEfet = JBD.ZERO;
      ibsMun.tributoDevido = JBD.ZERO;
      tr.aliquotaEfetiva = compraGov.pAliqIBSMun;
      tr.tributoDevido = compraGov.vTribIBSMun;
    } else {
      ibsMun.grupoReducao.pAliqEfet = compraGov.pAliqIBSMun;
      ibsMun.tributoDevido = compraGov.vTribIBSMun;
    }
  }
}

function mergeGrupoEtapa(g1: GrupoEtapaMonofasiaOutput | null, g2: GrupoEtapaMonofasiaOutput | null): GrupoEtapaMonofasiaOutput | null {
  if (g1 === null) return g2;
  if (g2 === null) return g1;
  return {
    quantidade: g1.quantidade ?? g2.quantidade ?? null,
    aliquotaAdRem: g1.aliquotaAdRem ?? g2.aliquotaAdRem ?? null,
    valor: (g1.valor ?? JBD.ZERO).add(g2.valor ?? JBD.ZERO),
  };
}

function getMonofasia(cbs: CbsIbsOutput | null, ibsEstadual: CbsIbsOutput | null, ibsMunicipal: CbsIbsOutput | null): MonofasiaDomain | null {
  const monoPadrao = MonofasiaPadraoCreate(cbs, ibsEstadual, ibsMunicipal);
  const monoReten = MonofasiaRetencaoCreate(cbs, ibsEstadual, ibsMunicipal);
  const monoRet = MonofasiaRetCreate(cbs, ibsEstadual, ibsMunicipal);
  const monoDif = MonofasiaDifCreate(cbs, ibsEstadual, ibsMunicipal);
  if (monoPadrao !== null || monoReten !== null || monoRet !== null || monoDif !== null) {
    const m = new MonofasiaDomain();
    m.gMonoPadrao = monoPadrao;
    m.gMonoReten = monoReten;
    m.gMonoRet = monoRet;
    m.gMonoDif = monoDif;
    const vIBSMono = monoPadrao !== null ? monoPadrao.vIBSMono : JBD.ZERO;
    const vCBSMono = monoPadrao !== null ? monoPadrao.vCBSMono : JBD.ZERO;
    const vIBSMonoReten = monoReten !== null ? monoReten.vIBSMonoReten : JBD.ZERO;
    const vCBSMonoReten = monoReten !== null ? monoReten.vCBSMonoReten : JBD.ZERO;
    const vIBSMonoDif = monoDif !== null ? monoDif.vIBSMonoDif : JBD.ZERO;
    const vCBSMonoDif = monoDif !== null ? monoDif.vCBSMonoDif : JBD.ZERO;
    m.vTotIBSMonoItem = vIBSMono.add(vIBSMonoReten).subtract(vIBSMonoDif);
    m.vTotCBSMonoItem = vCBSMono.add(vCBSMonoReten).subtract(vCBSMonoDif);
    return m;
  }
  return null;
}

const etapaDe = (o: CbsIbsOutput | null, k: "tributoMonofasico" | "tributoSujeitoRetencao" | "tributoRetido") =>
  o !== null && o.grupoMonofasia !== null ? o.grupoMonofasia[k] : null;

function MonofasiaPadraoCreate(cbs: CbsIbsOutput | null, ibsUF: CbsIbsOutput | null, _ibsMun: CbsIbsOutput | null): MonofasiaPadraoDomain | null {
  const cbsEtapa = etapaDe(cbs, "tributoMonofasico");
  const ibsEtapa = etapaDe(ibsUF, "tributoMonofasico"); // municipal desconsiderada (PARITY)
  if (cbsEtapa === null && ibsEtapa === null) return null;
  const mergedIbs = ibsEtapa !== null ? mergeGrupoEtapa(ibsEtapa, null) : null;
  const base = cbsEtapa;
  const q = mergedIbs !== null ? mergedIbs.quantidade : base !== null ? base.quantidade : null;
  const adRemIbs = mergedIbs !== null ? mergedIbs.aliquotaAdRem : null;
  const valIbs = mergedIbs !== null ? mergedIbs.valor : null;
  return {
    qBCMono: q ?? JBD.ZERO,
    adRemIBS: adRemIbs ?? JBD.ZERO,
    adRemCBS: base !== null ? (base.aliquotaAdRem ?? JBD.ZERO) : JBD.ZERO,
    vIBSMono: valIbs ?? JBD.ZERO,
    vCBSMono: base !== null ? (base.valor ?? JBD.ZERO) : JBD.ZERO,
  };
}

function MonofasiaRetencaoCreate(cbs: CbsIbsOutput | null, ibsUF: CbsIbsOutput | null, _ibsMun: CbsIbsOutput | null): MonofasiaRetencaoDomain | null {
  const cbsEtapa = etapaDe(cbs, "tributoSujeitoRetencao");
  const ibsEtapa = etapaDe(ibsUF, "tributoSujeitoRetencao");
  if (cbsEtapa === null && ibsEtapa === null) return null;
  const mergedIbs = ibsEtapa;
  return {
    qBCMonoReten: mergedIbs !== null ? (mergedIbs.quantidade ?? JBD.ZERO) : cbsEtapa !== null ? (cbsEtapa.quantidade ?? JBD.ZERO) : JBD.ZERO,
    adRemIBSReten: mergedIbs !== null ? (mergedIbs.aliquotaAdRem ?? JBD.ZERO) : JBD.ZERO,
    vIBSMonoReten: mergedIbs !== null ? (mergedIbs.valor ?? JBD.ZERO) : JBD.ZERO,
    adRemCBSReten: cbsEtapa !== null ? (cbsEtapa.aliquotaAdRem ?? JBD.ZERO) : JBD.ZERO,
    vCBSMonoReten: cbsEtapa !== null ? (cbsEtapa.valor ?? JBD.ZERO) : JBD.ZERO,
  };
}

function MonofasiaRetCreate(cbs: CbsIbsOutput | null, ibsUF: CbsIbsOutput | null, _ibsMun: CbsIbsOutput | null): MonofasiaRetidoAnteriormenteDomain | null {
  const cbsEtapa = etapaDe(cbs, "tributoRetido");
  const ibsEtapa = etapaDe(ibsUF, "tributoRetido");
  if (cbsEtapa === null && ibsEtapa === null) return null;
  return {
    qBCMonoRet: ibsEtapa !== null ? (ibsEtapa.quantidade ?? JBD.ZERO) : cbsEtapa !== null ? (cbsEtapa.quantidade ?? JBD.ZERO) : JBD.ZERO,
    adRemIBSRet: ibsEtapa !== null ? (ibsEtapa.aliquotaAdRem ?? JBD.ZERO) : JBD.ZERO,
    vIBSMonoRet: ibsEtapa !== null ? (ibsEtapa.valor ?? JBD.ZERO) : JBD.ZERO,
    adRemCBSRet: cbsEtapa !== null ? (cbsEtapa.aliquotaAdRem ?? JBD.ZERO) : JBD.ZERO,
    vCBSMonoRet: cbsEtapa !== null ? (cbsEtapa.valor ?? JBD.ZERO) : JBD.ZERO,
  };
}

function MonofasiaDifCreate(cbs: CbsIbsOutput | null, ibsUF: CbsIbsOutput | null, _ibsMun: CbsIbsOutput | null): MonofasiaDiferimentoDomain | null {
  const cbsEtapa = cbs !== null && cbs.grupoMonofasia !== null ? cbs.grupoMonofasia.tributoDiferido : null;
  const ibsEtapa = ibsUF !== null && ibsUF.grupoMonofasia !== null ? ibsUF.grupoMonofasia.tributoDiferido : null;
  if (cbsEtapa === null && ibsEtapa === null) return null;
  return {
    pDifIBS: ibsEtapa !== null ? (ibsEtapa.percentualDiferimento ?? JBD.ZERO) : JBD.ZERO,
    vIBSMonoDif: ibsEtapa !== null ? (ibsEtapa.valorDiferimento ?? JBD.ZERO) : JBD.ZERO,
    pDifCBS: cbsEtapa !== null ? (cbsEtapa.percentualDiferimento ?? JBD.ZERO) : JBD.ZERO,
    vCBSMonoDif: cbsEtapa !== null ? (cbsEtapa.valorDiferimento ?? JBD.ZERO) : JBD.ZERO,
  };
}
