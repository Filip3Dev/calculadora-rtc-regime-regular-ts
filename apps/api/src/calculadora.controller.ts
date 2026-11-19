/**
 * Controller principal — espelha CalculadoraTributoController e
 * ObservabilidadeController do serviço Java.
 */
import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CATALOGO_ERROS, calculadora } from "./calc.provider.js";
import { BodyExemplo, OPERACAO_OBSERVABILIDADE, OPERACAO_SIMPLES, RespostaOk, RespostaProblem422 } from "./swagger-exemplos.js";
import { parseOperacao, validarOperacaoRequest } from "calculadora-rtc-core";

@ApiTags("calculadora")
@Controller("calculadora")
export class CalculadoraController {
  /** POST /api/calculadora/regime-geral — cálculo fail-fast. */
  @Post("regime-geral")
  @HttpCode(200)
  @BodyExemplo("Operação com itens (NCM/NBS, CST, cClassTrib, base de cálculo; a partir de 2027 informe aliquotasNominais)", OPERACAO_SIMPLES)
  @RespostaOk("ROC com grupos de tributação por item e totais", { objetos: [{ nObj: 1, tribCalc: { IBSCBS: { CST: "000", cClassTrib: "000001", gIBSCBS: { vBC: "200.00", gCBS: { pCBS: "0.90", vCBS: "1.80" } } } } }], total: { tribCalc: { IBSCBSTot: { vBCIBSCBS: "200.00" } } } })
  @RespostaProblem422()
  @ApiOperation({ summary: "Cálculo de CBS, IBS e Imposto Seletivo (a operação falha no primeiro erro)" })
  calcularTributos(@Body() operacao: Record<string, unknown>): Record<string, unknown> {
    // PARITY: Bean Validation do original roda antes do cálculo (400 MethodArgumentNotValid)
    const violacoes = validarOperacaoRequest(parseOperacao(operacao as never));
    if (violacoes.length > 0) {
      const detail = "Um ou mais campos são inválidos - " + violacoes.map((x) => `[${x.campo}: ${x.mensagem}] `).join("");
      throw new BadRequestException({
        type: "about:blank", title: "Bad Request", status: 400, detail, instance: "/api/calculadora/regime-geral",
      });
    }
    return calculadora().calcularTributos(operacao as never);
  }

  /** POST /api/calculadora/observabilidade/regime-geral — erros por item. */
  @Post("observabilidade/regime-geral")
  @HttpCode(200)
  @BodyExemplo("Operação com 4 itens, um deles com erro proposital (NCM não vinculada)", OPERACAO_OBSERVABILIDADE)
  @RespostaOk("HTTP 200 mesmo com itens em erro — verifique estadoItem de cada item (CALCULADO, CALCULO_SIMULADO, INCONSISTENCIA_ENTRADA...)", { objetos: [{ nObj: 4, estadoItem: "INCONSISTENCIA_ENTRADA", erros: [{ code: "REG-011", pointer: "#/itens/3/ncm" }] }] })
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
