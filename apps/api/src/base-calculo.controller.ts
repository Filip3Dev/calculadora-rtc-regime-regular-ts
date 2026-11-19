/**
 * Base de cálculo unificada — POST /calculadora/base-calculo/base-calculo-unificada.
 */
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JBD, OpcaoSimplesNacional, RegimeApuracaoIbsCbsSN } from "calculadora-rtc-core";
import { calculadora } from "./calc.provider.js";
import { BASE_CIBS_MERCADORIAS, BASE_IS_MERCADORIAS, BASE_UNIFICADA, BASE_UNIFICADA_NFSE, BodyExemplo, RespostaOk, RespostaProblem422 } from "./swagger-exemplos.js";

interface BaseCalculoUnificadaRequest {
  anoFatoGerador: number;
  tipoDocumento: number;
  natureza?: "BEM" | "SERVICO" | null;
  componentes: Record<string, number | string | null>;
}

@ApiTags("base-calculo")
@Controller("calculadora/base-calculo")
export class BaseCalculoController {
  @Post("base-calculo-unificada")
  @HttpCode(200)
  @BodyExemplo("Componentes ACHATADOS no nível raiz (JsonUnwrapped, como a API oficial); natureza aceita bem/servico", BASE_UNIFICADA)
  @RespostaOk("Bases RG/IS/SN com avisos de componentes ignorados por vigência", { baseRG: "870.00000000", baseIS: "840.00000000", baseSN: "1060.00000000", avisos: ["Campo vPIS não compõe as bases para o ano 2027 (vigência 2026–2026) e foi ignorado no cálculo"] })
  @ApiOperation({ summary: "Cálculo das bases unificadas (RG/IBS-CBS, IS e Simples Nacional) a partir dos componentes" })
  baseCalculoUnificada(@Body() req: BaseCalculoUnificadaRequest) {
    // PARITY: @JsonUnwrapped do original — componentes vêm ACHATADOS no mesmo
    // nível dos demais campos (aceita também aninhado em "componentes")
    const { anoFatoGerador, tipoDocumento, natureza, componentes, ...achatados } = req;
    return calculadora().calcularBaseUnificada({
      componentes: (componentes && Object.keys(componentes).length > 0 ? componentes : achatados),
      ano: req.anoFatoGerador,
      // natureza aceita bem/servico em qualquer caixa ( Jackson enum do original)
      natureza: req.natureza ? (req.natureza.toUpperCase() as "BEM" | "SERVICO") : null,
      tpDoc: req.tipoDocumento,
    });
  }

  /** POST /api/calculadora/base-calculo/is-mercadorias — base do Imposto Seletivo (mercadorias). */
  @Post("is-mercadorias")
  @HttpCode(200)
  @BodyExemplo("Ano ≥ 2027; ICMS/ISS só até 2033", BASE_IS_MERCADORIAS)
  @RespostaOk("Base do IS", { baseCalculo: "1020" })
  @RespostaProblem422()
  @ApiOperation({ summary: "Cálculo da base de cálculo do Imposto Seletivo em operações com mercadorias" })
  calcularISMercadorias(@Body() req: Record<string, number | string>): unknown {
    const j = (v: number | string | undefined): JBD => JBD.of(v ?? 0) ?? JBD.ZERO;
    return calculadora().calcularISMercadorias({
      anoFatoGerador: Number(req.anoFatoGerador),
      valorBem: j(req.valorBem),
      ajusteAcrescimos: j(req.ajusteAcrescimos),
      juros: j(req.juros),
      multas: j(req.multas),
      encargos: j(req.encargos),
      freteCobrado: j(req.freteCobrado),
      outrosTributos: j(req.outrosTributos),
      demaisImportancias: j(req.demaisImportancias),
      icms: j(req.icms),
      iss: j(req.iss),
      cosip: j(req.cosip),
      ipi: j(req.ipi),
      descontoIncondicional: j(req.descontoIncondicional),
      bonificacao: j(req.bonificacao),
      devolucaoVendas: j(req.devolucaoVendas),
    });
  }

  /** POST /api/calculadora/base-calculo/cbs-ibs-mercadorias — base de CBS/IBS (mercadorias). */
  @Post("cbs-ibs-mercadorias")
  @HttpCode(200)
  @BodyExemplo("Ano ≥ 2026; PIS/COFINS só até 2027, ICMS/ISS até 2033", BASE_CIBS_MERCADORIAS)
  @RespostaOk("Base de CBS/IBS", { baseCalculo: "1220" })
  @RespostaProblem422()
  @ApiOperation({ summary: "Cálculo da base de cálculo de CBS e IBS em operações com mercadorias" })
  calcularCibs(@Body() req: Record<string, number | string>): unknown {
    const j = (v: number | string | undefined): JBD => JBD.of(v ?? 0) ?? JBD.ZERO;
    return calculadora().calcularCibs({
      anoFatoGerador: Number(req.anoFatoGerador),
      valorBem: j(req.valorBem),
      ajusteAcrescimos: j(req.ajusteAcrescimos),
      juros: j(req.juros),
      multas: j(req.multas),
      encargos: j(req.encargos),
      frete: j(req.frete),
      impostoSeletivo: j(req.impostoSeletivo),
      outrosTributos: j(req.outrosTributos),
      demaisImportancias: j(req.demaisImportancias),
      icms: j(req.icms),
      iss: j(req.iss),
      pis: j(req.pis),
      pisImportacao: j(req.pisImportacao),
      cofins: j(req.cofins),
      cofinsImportacao: j(req.cofinsImportacao),
      cosip: j(req.cosip),
      ipi: j(req.ipi),
      descontoIncondicional: j(req.descontoIncondicional),
    });
  }

  /** POST /api/calculadora/base-calculo/base-calculo-unificada-nfse */
  @Post("base-calculo-unificada-nfse")
  @HttpCode(200)
  @BodyExemplo("opSimpNac: 1=Não optante, 2=MEI, 3=Optante ME/EPP, 4=Pendente; situacao: comum, salaoParceiro ou locacao9903", BASE_UNIFICADA_NFSE)
  @RespostaOk("Bases RG e SN com avisos/erros (E1302, E1534, E0436, LEIAUTE-XTP)", { baseRG: "820.00", baseSN: null, avisos: [], erros: [] })
  @ApiOperation({ summary: "Bases unificadas RG e SN da NFS-e (MEI, locação 99.03, salão/profissional parceiro, documentos de ajuste)" })
  baseCalculoUnificadaNfse(@Body() req: {
      anoFatoGerador: number;
      opSimpNac: number;
      situacao: "comum" | "salaoParceiro" | "locacao9903";
      vServ?: number | string | null;
      vDescIncond?: number | string | null;
      vISSQN?: number | string | null;
      vPIS?: number | string | null;
      vCOFINS?: number | string | null;
      regApIBSCBSSN?: number | null;
      documentos?: Array<{ tpAjusteBC: string; vAjusteAplic: number | string; xTpAjusteBC?: string | null }> | null;
      locacao?: { pCopropriedade: number | string; vTotOper: number | string; vDescIncondTot: number | string; somaAjustesLocImoveis: number | string } | null;
    },
  ) {
    return calculadora().calcularNfseBaseUnificada({
      anoFatoGerador: req.anoFatoGerador,
      opSimpNac: req.opSimpNac as OpcaoSimplesNacional,
      situacao: req.situacao,
      vServ: JBD.of(req.vServ ?? null),
      vDescIncond: JBD.of(req.vDescIncond ?? null),
      vISSQN: JBD.of(req.vISSQN ?? null),
      vPIS: JBD.of(req.vPIS ?? null),
      vCOFINS: JBD.of(req.vCOFINS ?? null),
      regApIBSCBSSN: (req.regApIBSCBSSN ?? null) as RegimeApuracaoIbsCbsSN | null,
      documentos: (req.documentos ?? null)?.map((d) => ({
        tpAjusteBC: d.tpAjusteBC,
        vAjusteAplic: JBD.of(d.vAjusteAplic)!,
        xTpAjusteBC: d.xTpAjusteBC ?? null,
      })) ?? null,
      locacao: req.locacao
        ? {
            pCopropriedade: JBD.of(req.locacao.pCopropriedade)!,
            vTotOper: JBD.of(req.locacao.vTotOper)!,
            vDescIncondTot: JBD.of(req.locacao.vDescIncondTot)!,
            somaAjustesLocImoveis: JBD.of(req.locacao.somaAjustesLocImoveis)!,
          }
        : null,
    }) as unknown as Record<string, unknown>;
  }
}
