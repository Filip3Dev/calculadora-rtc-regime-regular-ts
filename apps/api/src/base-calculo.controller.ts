/**
 * Base de cálculo unificada — POST /calculadora/base-calculo/base-calculo-unificada.
 */
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JBD, OpcaoSimplesNacional, RegimeApuracaoIbsCbsSN } from "@rtc/core";
import { calculadora } from "./calc.provider.js";

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
  @ApiOperation({ summary: "Cálculo das bases unificadas (RG/IBS-CBS, IS e Simples Nacional) a partir dos componentes" })
  baseCalculoUnificada(@Body() req: BaseCalculoUnificadaRequest) {
    return calculadora().calcularBaseUnificada({
      componentes: req.componentes,
      ano: req.anoFatoGerador,
      natureza: req.natureza ?? null,
      tpDoc: req.tipoDocumento,
    });
  }

  /** POST /api/calculadora/base-calculo/is-mercadorias — base do Imposto Seletivo (mercadorias). */
  @Post("is-mercadorias")
  @HttpCode(200)
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
