/**
 * Controller principal — espelha CalculadoraTributoController e
 * ObservabilidadeController do serviço Java.
 */
import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CATALOGO_ERROS, calculadora } from "./calc.provider.js";

@ApiTags("calculadora")
@Controller("calculadora")
export class CalculadoraController {
  /** POST /api/calculadora/regime-geral — cálculo fail-fast. */
  @Post("regime-geral")
  @HttpCode(200)
  @ApiOperation({ summary: "Cálculo de CBS, IBS e Imposto Seletivo (a operação falha no primeiro erro)" })
  calcularTributos(@Body() operacao: Record<string, unknown>): Record<string, unknown> {
    return calculadora().calcularTributos(operacao as never);
  }

  /** POST /api/calculadora/observabilidade/regime-geral — erros por item. */
  @Post("observabilidade/regime-geral")
  @HttpCode(200)
  @ApiOperation({ summary: "Cálculo com observabilidade (erros por item, sem interromper os demais)" })
  calcularObservabilidade(
    @Body() operacao: Record<string, unknown>,
    @Query("baseURL") baseURL?: string,
  ): Record<string, unknown> {
    return calculadora().calcularTributosObservabilidade(operacao as never, baseURL ?? "");
  }

  /** GET /api/calculadora/observabilidade/erros?codigo=REG-011 */
  @Get("observabilidade/erros")
  @ApiOperation({ summary: "Descrição de um código de erro da observabilidade" })
  erros(@Query("codigo") codigo?: string): unknown {
    if (codigo) {
      const erro = CATALOGO_ERROS.find((e) => e.codigo === codigo);
      if (!erro) return { codigo, titulo: "Código de erro desconhecido" };
      return {
        codigo: erro.codigo,
        campo: erro.campo,
        estadoItem: erro.estado,
        titulo: erro.titulo,
        documentacao: `/api/calculadora/observabilidade/erros?codigo=${erro.codigo}`,
      };
    }
    return CATALOGO_ERROS;
  }

  /** GET /api/calculadora/versao — versão da base de dados. */
  @Get("versao")
  @ApiOperation({ summary: "Versão da base de dados embutida" })
  versao() {
    return calculadora().versaoBase();
  }
}
