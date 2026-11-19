/**
 * Base de cálculo unificada — POST /calculadora/base-calculo/base-calculo-unificada.
 */
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
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
}
