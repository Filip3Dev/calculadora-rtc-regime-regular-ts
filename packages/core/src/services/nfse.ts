/**
 * NFS-e — porte fiel de NfseService + BaseCalculoUnificadaNfseService e enums.
 */
import { JBD, dividirPorCem, multiplicar, subtrair, formatarMoeda } from "../model/jbd.js";
import { CampoInvalidoException } from "../errors.js";
import type { Repositories } from "../db/repositories.js";

const isBlank = (s: string | null | undefined): boolean => s === null || s === undefined || s.trim() === "";

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum OpcaoSimplesNacional {
  NAO_OPTANTE = 1,
  MEI = 2,
  OPTANTE_ME_E_EPP = 3,
  OPTANTE_PENDENTE = 4,
}
export const opSimplesNac = {
  isOptante: (o: OpcaoSimplesNacional) => o === 3 || o === 4,
  isMei: (o: OpcaoSimplesNacional) => o === 2,
  isPendente: (o: OpcaoSimplesNacional) => o === 4,
  exigeRegimeApuracao: (o: OpcaoSimplesNacional) => o === 3 || o === 4,
  proibeRegimeApuracao: (o: OpcaoSimplesNacional) => o === 1,
  vedaLocacao: (o: OpcaoSimplesNacional) => o === 2 || o === 3,
  baseSNInaplicavel: (o: OpcaoSimplesNacional) => o === 1 || o === 2,
};

export type SituacaoOperacaoNfse = "comum" | "salaoParceiro" | "locacao9903";
export const situacaoNfse = {
  isLocacao: (s: SituacaoOperacaoNfse) => s === "locacao9903",
  isSalaoParceiro: (s: SituacaoOperacaoNfse) => s === "salaoParceiro",
  ignoraDocumentos: (s: SituacaoOperacaoNfse) => s === "locacao9903",
};

export enum RegimeApuracaoIbsCbsSN {
  IBS_CBS_PELO_SN = 1,
  CBS_PELO_SN_IBS_REGULAR = 2,
  AMBOS_REGULARES = 3,
}
export const regApIsCalculaBaseSN = (r: RegimeApuracaoIbsCbsSN): boolean => r !== RegimeApuracaoIbsCbsSN.AMBOS_REGULARES;

/** TipoAjusteNfse: código → [repercuteIbsCbs, repercuteSN, requerDescricao]. */
const TIPOS_AJUSTE: Record<string, [boolean, boolean, boolean]> = {
  "101": [true, false, false], // subcontratação
  "102": [true, false, false], // consórcio
  "103": [true, false, false], // intermediação
  "104": [true, false, false], // cessão mão de obra
  "105": [true, false, false], // ressarcimento
  "199": [true, false, true], // outros (exige descrição)
  "9": [false, true, false], // profissional parceiro
};
export const tipoAjusteNfse = {
  isConhecido: (codigo: string) => codigo in TIPOS_AJUSTE,
  repercuteIbsCbs: (codigo: string) => TIPOS_AJUSTE[codigo]?.[0] ?? false,
  repercuteSN: (codigo: string) => TIPOS_AJUSTE[codigo]?.[1] ?? false,
  requerDescricao: (codigo: string) => TIPOS_AJUSTE[codigo]?.[2] ?? false,
  OUTROS: "199",
};

/** Locais de fornecimento (enum LocalFornecimento do original). */
export const LOCAIS_FORNECIMENTO: Record<number, string> = {
  1: "Endereço diverso do fornecedor, adquirente ou destinatário",
  2: "Local da prestação do serviço diverso do estabelecimento do fornecedor",
  3: "Endereço do destinatário",
  4: "Endereço fornecido para entrega do bem",
  5: "Estabelecimento do fornecedor como local da prestação",
  6: "Local do porto como local da prestação",
  7: "Local da prestação correspondente à extensão da via explorada, proporcionalmente ao território dos entes tributantes",
  8: "Local da retirada do bem",
  9: "Local de início do transporte",
  10: "Local do domicílio principal do destinatário residente ou domiciliado no País, caso o adquirente não seja residente ou domiciliado no País",
  11: "Local do domicílio principal do adquirente residente ou domiciliado no País. Nas aquisições indicadas no art. 11, §4º, II, considera-se domicílio principal do adquirente o estabelecimento matriz",
  12: "local do domicílio principal do destinatário residente ou domiciliado no País",
  13: "Local do evento a que se refere o serviço",
  14: "Localidade do imóvel",
  15: "Estabelecimento do fornecedor como o local da entrega ou disponibilização do bem ao destinatário",
  16: "Local da realização da operação e sua retirada",
  17: "Endereço do destinatário fornecido para entrega ou disponibilização (assim considerado o destino final indicado pelo adquirente)",
  18: "Local onde se encontra o bem móvel material",
  19: "Local onde se encontra o bem móvel material (Local da retirada)",
  20: "Local do domicílio principal do adquirente (estabelecimento matriz)",
  21: "Domicílio principal do destinatário",
  22: "Local de instalação do terminal",
  23: "Local do domicílio principal do adquirente (assim considerada a matriz), nas aquisições realizadas de forma centralizada por contribuinte sujeito ao regime regular do IBS e da CBS que possui mais de um estabelecimento e que não estejam sujeitas à vedação à apropriação de créditos",
  24: "Local da entrega ou disponibilização",
  25: "Local do estabelecimento principal do adquirente (assim considerada a matriz), conforme §4º do art. 11",
  26: "Local do estabelecimento do agente ou de seus representados que figurem na posição devedora da liquidação financeira apurada pela Câmara de Comercialização de Energia Elétrica",
  27: "Local do estabelecimento principal do fornecedor",
  28: "Local do estabelecimento principal do adquirente",
};

/** Locais de incidência (enum LocalIncidencia do original). */
export const LOCAIS_INCIDENCIA: Record<number, string> = {
  1: "Endereço do Destinatário",
  2: "Endereço do Tomador/Adquirente",
  3: "Estabelecimento do Prestador/Fornecedor",
  4: "Local da Prestação",
  5: "Local do Evento",
  6: "Localidade do Imóvel",
  7: "Localização do Trecho",
};

// ─── Modelos de entrada ──────────────────────────────────────────────────────

export interface DocumentoAjusteNfseInput {
  tpAjusteBC: string;
  vAjusteAplic: JBD;
  xTpAjusteBC?: string | null;
}

export interface LocacaoNfseInput {
  pCopropriedade: JBD;
  vTotOper: JBD;
  vDescIncondTot: JBD;
  somaAjustesLocImoveis: JBD;
}

export interface BaseCalculoUnificadaNfseInput {
  anoFatoGerador: number;
  opSimpNac: OpcaoSimplesNacional;
  situacao: SituacaoOperacaoNfse;
  vServ: JBD | null;
  vDescIncond: JBD | null;
  vISSQN: JBD | null;
  vPIS: JBD | null;
  vCOFINS: JBD | null;
  regApIBSCBSSN: RegimeApuracaoIbsCbsSN | null;
  documentos: DocumentoAjusteNfseInput[] | null;
  locacao: LocacaoNfseInput | null;
}

export interface ErroBaseCalculoNfse {
  codigo: string;
  mensagem: string;
}

export interface BaseCalculoUnificadaNfseOutput {
  baseRG: string | null;
  baseSN: string | null;
  avisos: string[];
  erros: ErroBaseCalculoNfse[];
}

// ─── BaseCalculoUnificadaNfseService ─────────────────────────────────────────

const ANO_EXTINCAO_PIS_COFINS = 2027;
const ANO_EXTINCAO_ISSQN = 2033;

const zero = (v: JBD | null | undefined): JBD => v ?? JBD.ZERO;

export class BaseCalculoUnificadaNfseService {
  calcular(input: BaseCalculoUnificadaNfseInput): BaseCalculoUnificadaNfseOutput {
    const avisos: string[] = [];
    const erros: ErroBaseCalculoNfse[] = [];
    const documentos = input.documentos ?? [];

    if (situacaoNfse.isLocacao(input.situacao) && input.locacao === null) {
      throw new CampoInvalidoException("Campo locacao obrigatório quando situacao é locacao9903");
    }

    // Validações de negócio
    const opSN = input.opSimpNac;
    const regAp = input.regApIBSCBSSN;
    if (opSimplesNac.exigeRegimeApuracao(opSN) && regAp === null) {
      erros.push({ codigo: "EXXX-REGAP", mensagem: "Campo regApIBSCBSSN obrigatório para optante do Simples Nacional" });
    }
    if (opSimplesNac.proibeRegimeApuracao(opSN) && regAp !== null) {
      erros.push({ codigo: "EXXX-REGAP", mensagem: "Campo regApIBSCBSSN proibido para não optante do Simples Nacional" });
    }
    if (opSimplesNac.vedaLocacao(opSN) && situacaoNfse.isLocacao(input.situacao)) {
      erros.push({ codigo: "EXXX-LOC-SN", mensagem: "Locação de imóveis incompatível com optante do Simples Nacional" });
    }

    // Varredura dos documentos — filtra inválidos
    const documentosValidos: DocumentoAjusteNfseInput[] = [];
    for (const doc of documentos) {
      const tipo = doc.tpAjusteBC;
      if (!tipoAjusteNfse.isConhecido(tipo)) {
        avisos.push(`Tipo de ajuste '${tipo}' desconhecido: documento ignorado`);
        continue;
      }
      if (tipoAjusteNfse.requerDescricao(tipo) && isBlank(doc.xTpAjusteBC)) {
        erros.push({
          codigo: "LEIAUTE-XTP",
          mensagem: `Campo xTpAjusteBC obrigatório para tipo de ajuste ${tipoAjusteNfse.OUTROS}`,
        });
        continue;
      }
      documentosValidos.push(doc);
    }

    // MEI — retorno antecipado
    if (opSimplesNac.isMei(opSN)) {
      avisos.push("E1302: Operação MEI: bases de cálculo não aplicáveis");
      if (documentos.length > 0) {
        erros.push({ codigo: "E0436", mensagem: "Documentos de ajuste não são permitidos para MEI" });
      }
      return { baseRG: null, baseSN: null, avisos, erros };
    }

    const ignora = situacaoNfse.ignoraDocumentos(input.situacao);
    const vCalcAjusteBCIBSCBS = ignora
      ? JBD.ZERO
      : documentosValidos.filter((d) => tipoAjusteNfse.repercuteIbsCbs(d.tpAjusteBC)).reduce((acc, d) => acc.add(d.vAjusteAplic), JBD.ZERO);
    const somaAjustesProfissionalParceiro = ignora
      ? JBD.ZERO
      : documentosValidos.filter((d) => tipoAjusteNfse.repercuteSN(d.tpAjusteBC)).reduce((acc, d) => acc.add(d.vAjusteAplic), JBD.ZERO);

    // E1534
    const vServ = zero(input.vServ);
    if (vCalcAjusteBCIBSCBS.compareTo(JBD.ZERO) > 0 && vCalcAjusteBCIBSCBS.compareTo(vServ) >= 0) {
      erros.push({
        codigo: "E1534",
        mensagem: `Soma dos ajustes (${formatarMoeda(vCalcAjusteBCIBSCBS)}) excede ou iguala o valor do serviço (${formatarMoeda(vServ)})`,
      });
    }

    // Avisos defensivos de contexto
    if (situacaoNfse.isLocacao(input.situacao) && documentos.length > 0) {
      avisos.push("Documentos de ajuste ignorados em contexto de locação de imóveis");
    }
    if (!situacaoNfse.isLocacao(input.situacao) && input.locacao !== null) {
      avisos.push("Grupo locacao ignorado fora de contexto de locação de imóveis");
    }

    const baseRG = this.calcularBaseRG(input, vCalcAjusteBCIBSCBS);
    const baseSN = this.calcularBaseSN(input, vCalcAjusteBCIBSCBS, somaAjustesProfissionalParceiro);

    if (opSimplesNac.isPendente(opSN)) {
      avisos.push("Optante pendente: cálculo realizado com ressalva");
    }

    const baseRGFinal = baseRG !== null ? baseRG.setScale(2).toPlainString() : null;
    const baseSNFinal = baseSN !== null ? baseSN.setScale(2).toPlainString() : null;

    if (baseRG !== null && baseRG.compareTo(JBD.ZERO) < 0) {
      erros.push({ codigo: "BASE-NEGATIVA", mensagem: `Base de cálculo RG negativa: ${formatarMoeda(baseRG.setScale(2))}` });
    }
    if (baseSN !== null && baseSN.compareTo(JBD.ZERO) < 0) {
      erros.push({ codigo: "BASE-NEGATIVA", mensagem: `Base de cálculo SN negativa: ${formatarMoeda(baseSN.setScale(2))}` });
    }

    return { baseRG: baseRGFinal, baseSN: baseSNFinal, avisos, erros };
  }

  private calcularBaseRG(input: BaseCalculoUnificadaNfseInput, vCalcAjusteBCIBSCBS: JBD): JBD | null {
    if (situacaoNfse.isLocacao(input.situacao)) return this.calcularBaseRGLocacao(input);
    const ano = input.anoFatoGerador;
    const deduzISSQN = ano < ANO_EXTINCAO_ISSQN ? zero(input.vISSQN) : JBD.ZERO;
    const deduzPIS = ano < ANO_EXTINCAO_PIS_COFINS ? zero(input.vPIS) : JBD.ZERO;
    const deduzCOFINS = ano < ANO_EXTINCAO_PIS_COFINS ? zero(input.vCOFINS) : JBD.ZERO;
    let resultado = zero(input.vServ);
    resultado = subtrair(resultado, zero(input.vDescIncond))!;
    resultado = subtrair(resultado, vCalcAjusteBCIBSCBS)!;
    resultado = subtrair(resultado, deduzISSQN)!;
    resultado = subtrair(resultado, deduzPIS)!;
    resultado = subtrair(resultado, deduzCOFINS)!;
    return resultado;
  }

  private calcularBaseRGLocacao(input: BaseCalculoUnificadaNfseInput): JBD {
    const loc = input.locacao!;
    const fator = dividirPorCem(loc.pCopropriedade)!;
    const vServEfetivo = multiplicar(fator, loc.vTotOper)!;
    const vDescIncondEfetivo = multiplicar(fator, loc.vDescIncondTot)!;
    const vCalcAjusteBCLocImoveis = multiplicar(fator, loc.somaAjustesLocImoveis)!;
    const ano = input.anoFatoGerador;
    const vPIS = ano < ANO_EXTINCAO_PIS_COFINS ? zero(input.vPIS) : JBD.ZERO;
    const vCOFINS = ano < ANO_EXTINCAO_PIS_COFINS ? zero(input.vCOFINS) : JBD.ZERO;
    // ISSQN não deduz na locação (subitem 99.03 sem incidência de ISSQN)
    let resultado = vServEfetivo;
    resultado = subtrair(resultado, vDescIncondEfetivo)!;
    resultado = subtrair(resultado, vCalcAjusteBCLocImoveis)!;
    resultado = subtrair(resultado, vPIS)!;
    resultado = subtrair(resultado, vCOFINS)!;
    return resultado;
  }

  private calcularBaseSN(input: BaseCalculoUnificadaNfseInput, vCalcAjusteBCIBSCBS: JBD, somaAjustesProfissionalParceiro: JBD): JBD | null {
    if (opSimplesNac.baseSNInaplicavel(input.opSimpNac)) return null;
    const regAp = input.regApIBSCBSSN;
    if (regAp === null) return null;

    let base: JBD;
    if (situacaoNfse.isLocacao(input.situacao)) {
      const loc = input.locacao!;
      const fator = dividirPorCem(loc.pCopropriedade)!;
      base = subtrair(multiplicar(fator, loc.vTotOper)!, multiplicar(fator, loc.vDescIncondTot)!)!;
    } else {
      base = subtrair(zero(input.vServ), zero(input.vDescIncond))!;
    }
    base = subtrair(base, vCalcAjusteBCIBSCBS)!;
    if (situacaoNfse.isSalaoParceiro(input.situacao) && regApIsCalculaBaseSN(regAp)) {
      base = subtrair(base, somaAjustesProfissionalParceiro)!;
    }
    return base;
  }
}

// ─── NfseService (base de cálculo legada + indicadores de operação) ─────────

export interface NfseBaseCalculoInput {
  anoFatoGerador: number;
  valorServico: JBD;
  descontoIncondicional: JBD;
  vCalcReeRepRes: JBD;
  vCalcDedRedIBSCBS: JBD;
  iss: JBD;
  pis: JBD;
  cofins: JBD;
}

export interface NfseValidacaoIndicadorOperacaoInput {
  cTribNac: string | null;
  cIndOp: string;
  cClassTrib: string;
  nbs: string;
  dataOcorrenciaFatoGerador: string;
}

export class NfseService {
  private static readonly ANO_INICIO_CBS_IBS = 2026;
  private static readonly ANO_EXTINCAO_PIS_COFINS = 2027;
  private static readonly ANO_EXTINCAO_ISS = 2033;
  private static readonly CCLASSTRIB_FALLBACK = "000001";

  constructor(private readonly repo: Repositories) {}

  calcularBaseCalculo(input: NfseBaseCalculoInput): { baseCalculo: string } {
    const ano = input.anoFatoGerador;
    if (ano < NfseService.ANO_INICIO_CBS_IBS) {
      throw new CampoInvalidoException(`O ano do fato gerador deve ser ${NfseService.ANO_INICIO_CBS_IBS} ou superior`);
    }
    this.validaValoresForaLimite({ PIS: input.pis, COFINS: input.cofins }, ano, NfseService.ANO_EXTINCAO_PIS_COFINS);
    this.validaValoresForaLimite({ ISS: input.iss }, ano, NfseService.ANO_EXTINCAO_ISS);

    const naoIntegra = input.descontoIncondicional
      .add(input.vCalcReeRepRes)
      .add(input.vCalcDedRedIBSCBS)
      .add(input.pis)
      .add(input.cofins)
      .add(input.iss);
    const baseCalculo = input.valorServico.subtract(naoIntegra);
    if (baseCalculo.compareTo(JBD.ZERO) < 0) {
      throw new CampoInvalidoException(
        "Base de cálculo não pode ser negativa. Valores que não integram a base são maiores que o valor do serviço.",
      );
    }
    return { baseCalculo: formatarMoeda(baseCalculo) };
  }

  private validaValoresForaLimite(campos: Record<string, JBD>, ano: number, anoExtincao: number): void {
    if (ano >= anoExtincao) {
      const informados = Object.entries(campos)
        .filter(([, v]) => v.compareTo(JBD.ZERO) !== 0)
        .map(([k]) => k)
        .sort();
      if (informados.length > 0) {
        throw new CampoInvalidoException(`Os seguintes campos não podem ser informados a partir de ${anoExtincao}: ${informados.join(", ")}`);
      }
    }
  }

  validarIndicadorOperacao(input: NfseValidacaoIndicadorOperacaoInput) {
    const cTribNacFormatado = formatarCTribNac(input.cTribNac);
    const existe = this.repo.validarCombinacaoIndicadorOperacao(
      input.nbs,
      input.cClassTrib,
      input.cIndOp,
      cTribNacFormatado,
      input.dataOcorrenciaFatoGerador,
    );
    return {
      cIndOp: input.cIndOp,
      cClassTrib: input.cClassTrib,
      nbs: input.nbs,
      cTribNac: input.cTribNac,
      dataOcorrenciaFatoGerador: input.dataOcorrenciaFatoGerador,
      valido: existe,
    };
  }

  consultarLocalOperacao(cIndOp: string, data: string) {
    const row = this.repo.buscarLocalOperacaoPorIndOp(cIndOp, data);
    if (row === null) {
      throw new Error(`Indicador de operação ${cIndOp} não encontrado para a data ${data}`); // IndicadorOperacaoNaoEncontradoException
    }
    return {
      cIndOp,
      dataOcorrenciaFatoGerador: data,
      codigoLocalFornecimento: row.localFornecimento,
      localFornecimento: row.localFornecimento !== null ? LOCAIS_FORNECIMENTO[row.localFornecimento] : null,
      codigoLocalIncidencia: row.localIncidencia,
      localIncidencia: row.localIncidencia !== null ? LOCAIS_INCIDENCIA[row.localIncidencia] : null,
    };
  }

  consultarIndicadoresOperacao(data: string, nbs: string | null): Array<Record<string, unknown>> {
    let rawData = nbs ? this.repo.buscarIndicadoresOperacao(data, nbs) : this.repo.buscarIndicadoresOperacao(data, null);
    return rawData.map((row) => ({
      cIndOp: row.cIndOp,
      tipoOperacao: row.tipoOperacao,
      codigoLocalFornecimento: row.localFornecimento,
      localFornecimento: row.localFornecimento !== null ? LOCAIS_FORNECIMENTO[row.localFornecimento] : null,
      codigoLocalIncidencia: row.localIncidencia,
      localIncidencia: row.localIncidencia !== null ? LOCAIS_INCIDENCIA[row.localIncidencia] : null,
      prestacaoServicoOnerosa: row.prestacaoServicoOnerosa,
      adquirenteExterior: row.adquirenteExterior,
    }));
  }

  consultarSituacoesClassificacoesPorNbs(nbs: string, data: string) {
    return this.repo.buscarSituacoesClassificacoesPorNbs(nbs, data);
  }
}

/** formatarCTribNac: "1400" → "1.40" · "109052" → "1.09.05". */
export function formatarCTribNac(cTribNac: string | null): string | null {
  if (cTribNac === null || cTribNac === "") return null;
  if (cTribNac.length === 4) {
    return `${parseInt(cTribNac.substring(0, 2), 10)}.${cTribNac.substring(2, 4)}`;
  }
  if (cTribNac.length === 6) {
    return `${parseInt(cTribNac.substring(0, 2), 10)}.${cTribNac.substring(2, 4)}.${cTribNac.substring(4, 6)}`;
  }
  return null;
}
