/**
 * Pedágio — porte do PedagioController oficial.
 */
import { Body, Controller, HttpCode, Post, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JBD } from "@rtc/core";
import type { Response } from "express";
import { calculadora } from "./calc.provider.js";

@ApiTags("pedagio")
@Controller("calculadora")
export class PedagioController {
  /** POST /api/calculadora/pedagio */
  @Post("pedagio")
  @HttpCode(200)
  @ApiOperation({ summary: "Cálculo de CBS e IBS em operações de pedágio, distribuídos por praça proporcionalmente à extensão do trecho" })
  pedagio(
    @Body()
    req: {
      dataHoraEmissao: string;
      codigoMunicipioOrigem: number;
      ufMunicipioOrigem: string;
      cst: string;
      cClassTrib: string;
      baseCalculo: number | string;
      extensaoTotal: number | string;
      trechos: Array<{ numero: number; municipio: number; uf: string; extensao: number | string }>;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = {
      dataHoraEmissao: req.dataHoraEmissao,
      codigoMunicipioOrigem: req.codigoMunicipioOrigem,
      ufMunicipioOrigem: req.ufMunicipioOrigem,
      cst: req.cst,
      cClassTrib: req.cClassTrib,
      baseCalculo: JBD.of(req.baseCalculo)!,
      extensaoTotal: JBD.of(req.extensaoTotal)!,
      trechos: req.trechos.map((t) => ({ ...t, extensao: JBD.of(t.extensao)! })),
    };
    const resultado = calculadora().calcularPedagio(input);
    const warning = calculadora().pedagioService.getWarningDadosSimulados(input);
    if (warning !== null) {
      res.setHeader("x-warning-dados-simulados", warning);
    }
    return resultado;
  }
}
