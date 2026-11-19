/**
 * Pedágio — porte fiel de PedagioService: CBS/IBS distribuídos por praça,
 * proporcionalmente à extensão do trecho.
 */
import { JBD, dividir, dividirPorCem, formatarAliquota, formatarMoeda, multiplicar } from "../model/jbd.js";
import { CampoInvalidoException } from "../errors.js";
import type { MunicipioService, UfService } from "./support.js";
import type { AliquotaPadraoService } from "./support.js";
import { Tributo } from "../model/types.js";

export interface TrechoPedagioInput {
  numero: number;
  municipio: number;
  uf: string;
  extensao: JBD;
}

export interface PedagioInput {
  dataHoraEmissao: string;
  codigoMunicipioOrigem: number;
  ufMunicipioOrigem: string;
  cst: string;
  cClassTrib: string;
  baseCalculo: JBD;
  extensaoTotal: JBD;
  trechos: TrechoPedagioInput[];
}

interface TributoPedagioOutputJson {
  aliquota: string;
  aliquotaEfetiva: string;
  tributoCalculado: string;
}

interface TrechoJson {
  numero: number;
  uf: string;
  municipio: number;
  baseCalculo: string;
  cbs: TributoPedagioOutputJson;
  ibsEstadual: TributoPedagioOutputJson;
  ibsMunicipal: TributoPedagioOutputJson;
  extensaoTrecho: string;
  extensaoTotal: string;
}

export class PedagioService {
  constructor(
    private readonly aliquotaPadraoService: AliquotaPadraoService,
    private readonly ufService: UfService,
    private readonly municipioService: MunicipioService,
  ) {}

  calcularCIBS(operacao: PedagioInput): Record<string, unknown> {
    this.validarNumerosUnicos(operacao);
    this.municipioService.validarMunicipio(operacao.codigoMunicipioOrigem, operacao.ufMunicipioOrigem);
    for (const t of operacao.trechos) {
      this.municipioService.validarMunicipio(t.municipio, t.uf);
    }
    const trechos = this.getTrechosPedagio(operacao);
    return {
      cst: operacao.cst,
      cClassTrib: operacao.cClassTrib,
      extensaoTotal: operacao.extensaoTotal.toPlainString(),
      dataHoraEmissao: operacao.dataHoraEmissao,
      municipioOrigem: operacao.codigoMunicipioOrigem,
      baseCalculo: formatarMoeda(operacao.baseCalculo),
      ufMunicipioOrigem: operacao.ufMunicipioOrigem,
      trechos,
      total: this.getTotal(trechos),
    };
  }

  /** Header x-warning-dados-simulados: só a partir de 2027 (CASO_GERAL). */
  getWarningDadosSimulados(operacao: PedagioInput): string | null {
    const dataOperacao = operacao.dataHoraEmissao.slice(0, 10);
    return dataOperacao < "2027-01-01" ? null : "CASO_GERAL";
  }

  private getTrechosPedagio(operacao: PedagioInput): TrechoJson[] {
    const x = operacao.extensaoTotal;
    const dataFatoGerador = operacao.dataHoraEmissao.slice(0, 10);

    return operacao.trechos
      .map((trecho) => {
        const baseCalculoCIBS = operacao.baseCalculo;
        const codigoUf = this.ufService.buscar(trecho.uf);
        const aliquotaCbs = this.buscarAliquotaPadrao(Tributo.CBS, dataFatoGerador, null, null);
        const aliquotaIbsEstadual = this.buscarAliquotaPadrao(Tributo.IBS_ESTADUAL, dataFatoGerador, codigoUf, null);
        const aliquotaIbsMunicipal = this.buscarAliquotaPadrao(Tributo.IBS_MUNICIPAL, dataFatoGerador, null, trecho.municipio);

        const aliquotaEfetivaCbs = dividir(aliquotaCbs.multiply(trecho.extensao), x)!;
        const aliquotaEfetivaIbsEstadual = dividir(aliquotaIbsEstadual.multiply(trecho.extensao), x)!;
        const aliquotaEfetivaIbsMunicipal = dividir(aliquotaIbsMunicipal.multiply(trecho.extensao), x)!;

        return {
          numero: trecho.numero,
          uf: trecho.uf,
          municipio: trecho.municipio,
          baseCalculo: formatarMoeda(baseCalculoCIBS),
          cbs: this.obterCIBS(aliquotaCbs, aliquotaEfetivaCbs, baseCalculoCIBS),
          ibsEstadual: this.obterCIBS(aliquotaIbsEstadual, aliquotaEfetivaIbsEstadual, baseCalculoCIBS),
          ibsMunicipal: this.obterCIBS(aliquotaIbsMunicipal, aliquotaEfetivaIbsMunicipal, baseCalculoCIBS),
          extensaoTrecho: trecho.extensao.toPlainString(),
          extensaoTotal: x.toPlainString(),
        } satisfies TrechoJson;
      })
      .sort((a, b) => a.numero - b.numero);
  }

  private obterCIBS(aliquota: JBD, aliquotaEfetiva: JBD, baseCalculo: JBD): TributoPedagioOutputJson {
    return {
      aliquota: formatarAliquota(aliquota.movePointRight(2)),
      aliquotaEfetiva: formatarAliquota(aliquotaEfetiva.movePointRight(2)),
      tributoCalculado: formatarMoeda(multiplicar(baseCalculo, aliquotaEfetiva)!),
    };
  }

  private buscarAliquotaPadrao(tributo: Tributo, data: string, codigoUf: number | null, codigoMunicipio: number | null): JBD {
    const aliquota = this.aliquotaPadraoService.buscarAliquota(tributo, codigoUf, codigoMunicipio, data);
    return dividirPorCem(aliquota.valorAplicavel())!;
  }

  private getTotal(trechos: TrechoJson[]) {
    const totalBaseCalculo = trechos[0]!.baseCalculo;
    const totaliza = (seletor: (t: TrechoJson) => TributoPedagioOutputJson) => {
      // soma sem arredondar; formata na saída (TDec1302)
      const soma = trechos.reduce((acc, t) => acc.add(JBD.parse(seletor(t).tributoCalculado)), JBD.ZERO);
      return {
        baseCalculo: totalBaseCalculo,
        valorApurado: formatarMoeda(soma),
        valorDevido: formatarMoeda(soma),
        valorTributo: formatarMoeda(soma),
      };
    };
    return {
      cbsTotal: totaliza((t) => t.cbs),
      ibsEstadualTotal: totaliza((t) => t.ibsEstadual),
      ibsMunicipalTotal: totaliza((t) => t.ibsMunicipal),
    };
  }

  private validarNumerosUnicos(operacao: PedagioInput): void {
    const vistos = new Set<number>();
    for (const trecho of operacao.trechos) {
      if (vistos.has(trecho.numero)) {
        throw new CampoInvalidoException(`Número de trecho duplicado: ${trecho.numero}`);
      }
      vistos.add(trecho.numero);
    }
  }
}
