/**
 * @rtc/core — Motor de cálculo CBS/IBS/Imposto Seletivo (LC 214/2025).
 * Porte TypeScript com paridade estrita da API oficial (RFB/SERPRO).
 */
import { Repositories } from "./db/repositories.js";
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
  NomenclaturaService,
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
} from "./services/support.js";
import { BaseCalculoUnificadaService, CalculoCbsIbsService, CalculoImpostoSeletivoService } from "./services/calculo.js";
import { CalculoTributoService, setTransferenciaCBSProvider } from "./services/calculadora.js";
import {
  CalculadoraService,
  ErrosCalculoException,
  ObservabilidadeService,
  ProcessamentoItemService,
  type ErroDetalhe,
} from "./services/orquestracao.js";
import { criarTotais } from "./services/totais.js";
import { parseComponentes, parseOperacao } from "./validation.js";
import { ErroGenericoValidacaoException } from "./errors.js";
import { objetoJson, serializarOper, serializarROC, totaisJson } from "./serialize.js";
import type { OperacaoJson } from "./model/types.js";
import { CompraGovernamentalDomain, type ObjetoDomain } from "./model/types.js";

export interface CalculadoraOptions {
  /** application.ibs.enabled (padrão true no perfil offline) */
  ibsEnabled?: boolean;
  /** application.memoriacalculo.enabled (padrão true) */
  memoriaCalculoEnabled?: boolean;
}

export class Calculadora {
  private readonly repos: Repositories;
  readonly calculadoraService: CalculadoraService;
  readonly observabilidadeService: ObservabilidadeService;
  readonly baseCalculoUnificadaService: BaseCalculoUnificadaService;

  private constructor(dbPath: string, opts: Required<CalculadoraOptions>) {
    this.repos = new Repositories(dbPath);

    // serviços de suporte
    const ufService = new UfService(this.repos);
    const municipioService = new MunicipioService(this.repos);
    const situacaoTributariaService = new SituacaoTributariaService(this.repos);
    const classificacaoTributariaService = new ClassificacaoTributariaService(this.repos);
    const tratamentoClassificacaoService = new TratamentoClassificacaoService(this.repos);
    const tratamentoTributarioService = new TratamentoTributarioService(this.repos);
    const aliquotaPadraoService = new AliquotaPadraoService(this.repos);
    const aliquotaReferenciaService = new AliquotaReferenciaService(this.repos);
    const percentualReducaoService = new PercentualReducaoService(this.repos);
    const aliquotaAdValoremServicoService = new AliquotaAdValoremServicoService(this.repos);
    const aliquotaAdValoremProdutoService = new AliquotaAdValoremProdutoService(this.repos);
    const aliquotaAdRemProdutoService = new AliquotaAdRemProdutoService(this.repos);
    const redutorCompraGovService = new RedutorCompraGovernamentalService(this.repos);
    const transferenciaCBSService = new TransferenciaCBSService(this.repos);
    const tipoDfeService = new TipoDfeService(this.repos);
    const tipoDfeClassificacaoService = new TipoDfeClassificacaoService(this.repos);
    const nomenclaturaService = new NomenclaturaService(this.repos, classificacaoTributariaService, tipoDfeClassificacaoService);
    const validacaoNomenclaturaService = new ValidacaoNomenclaturaService(
      nomenclaturaService,
      new NcmAplicavelService(this.repos),
      new NbsAplicavelService(this.repos),
    );
    const fundamentacaoService = new FundamentacaoClassificacaoService(this.repos);
    const memoriaCalculoService = new MemoriaCalculoService(
      this.repos,
      fundamentacaoService,
      tratamentoTributarioService,
      opts.memoriaCalculoEnabled,
    );
    const baseCalculoUnificadaService = new BaseCalculoUnificadaService();

    setTransferenciaCBSProvider((data) => transferenciaCBSService.getPercentualTransferencia(data));

    const calculoCbsIbsService = new CalculoCbsIbsService(
      percentualReducaoService,
      aliquotaReferenciaService,
      aliquotaPadraoService,
      aliquotaAdValoremServicoService,
      tratamentoTributarioService,
      classificacaoTributariaService,
      situacaoTributariaService,
    );
    const calculoImpostoSeletivoService = new CalculoImpostoSeletivoService(tratamentoTributarioService);
    const calculoTributoService = new CalculoTributoService(
      calculoCbsIbsService,
      calculoImpostoSeletivoService,
      memoriaCalculoService,
      transferenciaCBSService,
      opts.ibsEnabled,
    );
    const processamentoItemService = new ProcessamentoItemService(
      calculoTributoService,
      tratamentoClassificacaoService,
      classificacaoTributariaService,
      ufService,
      aliquotaAdValoremProdutoService,
      aliquotaAdRemProdutoService,
      aliquotaAdValoremServicoService,
      new NcmAplicavelService(this.repos),
      new NbsAplicavelService(this.repos),
      tipoDfeClassificacaoService,
      validacaoNomenclaturaService,
      new NcmService(this.repos),
      new NbsService(this.repos),
      situacaoTributariaService,
      redutorCompraGovService,
      baseCalculoUnificadaService,
    );

    this.calculadoraService = new CalculadoraService(
      ufService,
      municipioService,
      redutorCompraGovService,
      tipoDfeService,
      processamentoItemService,
      criarTotais,
    );
    this.observabilidadeService = new ObservabilidadeService(
      processamentoItemService,
      ufService,
      municipioService,
      redutorCompraGovService,
      tipoDfeService,
      criarTotais,
    );
    this.baseCalculoUnificadaService = baseCalculoUnificadaService;
  }

  static create(dbPath: string, opts: CalculadoraOptions = {}): Calculadora {
    return new Calculadora(dbPath, {
      ibsEnabled: opts.ibsEnabled ?? true,
      memoriaCalculoEnabled: opts.memoriaCalculoEnabled ?? true,
    });
  }

  /** POST /calculadora/regime-geral — cálculo fail-fast. Retorna JSON serializado. */
  calcularTributos(input: OperacaoJson): Record<string, unknown> {
    const operacao = parseOperacao(input);
    const r = this.calculadoraService.calcularTributos(operacao);
    return serializarROC({ oper: serializarOper(r.oper), objetos: r.roc, total: r.total });
  }

  /**
   * POST /calculadora/observabilidade/regime-geral — erros acumulados por item.
   * Erros de operação (validação global/negócio) lançam ErrosCalculoException.
   */
  calcularTributosObservabilidade(input: OperacaoJson, baseURL = ""): Record<string, unknown> {
    const operacao = parseOperacao(input);
    const r = this.observabilidadeService.processarOperacao(operacao, baseURL);
    return serializarObservabilidadeResultado(r);
  }

  /**
   * POST /calculadora/base-calculo/base-calculo-unificada — bases RG/IS/SN
   * a partir dos componentes, ano, natureza e tipo de documento.
   */
  calcularBaseUnificada(input: {
    componentes: Record<string, number | string | null>;
    ano: number;
    natureza: import("./model/types.js").BaseCalculoNatureza | null;
    tpDoc: number;
  }): Record<string, unknown> {
    const componentes = parseComponentes(input.componentes);
    if (componentes === null) throw new ErroGenericoValidacaoException("Componentes da base de cálculo não informados");
    const r = this.baseCalculoUnificadaService.calcular(componentes, input.ano, input.natureza, input.tpDoc);
    return {
      baseRG: r.baseRG.toPlainString(),
      baseIS: r.baseIS.toPlainString(),
      baseSN: r.baseSN.toPlainString(),
      avisos: r.avisos,
    };
  }

  versaoBase(): { versao: string; data: string } {
    return this.repos.versaoBaseDados();
  }

  repositories(): Repositories {
    return this.repos;
  }

  close(): void {
    this.repos.close();
  }
}

function serializarObservabilidadeResultado(r: {
  oper: unknown;
  objetos: Array<{
    nObj: number;
    estadoItem: string;
    tribCalc?: import("./model/types.js").TributosDomain;
    erros?: ErroDetalhe[];
  }>;
  total: import("./model/types.js").ValoresTotaisDomain | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const oper = serializarOper(r.oper);
  if (oper) out.oper = oper;
  out.objetos = r.objetos.map((item) => {
    const j: Record<string, unknown> = { nObj: item.nObj, estadoItem: item.estadoItem };
    if (item.tribCalc) {
      j.tribCalc = tribCalcJson(item.tribCalc);
    }
    if (item.erros && item.erros.length > 0) j.erros = item.erros;
    return j;
  });
  const total = totaisJson(r.total);
  if (total) out.total = total;
  return out;
}

function tribCalcJson(t: import("./model/types.js").TributosDomain): unknown {
  const fake = { nObj: 0, tribCalc: t, calculoSimulado: false } as ObjetoDomain;
  return (objetoJson(fake) as { tribCalc?: unknown }).tribCalc;
}

export { ErrosCalculoException };
export type { ErroDetalhe };
export * from "./model/jbd.js";
export * from "./errors.js";
export type { OperacaoJson, ItemOperacaoJson } from "./model/types.js";
export { CATALOGO_ERROS } from "./errors.js";
export { objetoJson } from "./serialize.js";
