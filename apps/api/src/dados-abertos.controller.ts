/**
 * Dados abertos — consultas às tabelas oficiais usadas no cálculo.
 */
import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DADOS_ABERTOS } from "./dados-abertos.service.js";

const hoje = () => new Date().toISOString().slice(0, 10);

@ApiTags("dados-abertos")
@Controller("calculadora/dados-abertos")
export class DadosAbertosController {
  @Get("ufs")
  @ApiOperation({ summary: "Lista de UFs" })
  ufs() {
    return DADOS_ABERTOS.ufs();
  }

  @Get("municipios")
  @ApiOperation({ summary: "Municípios por UF" })
  municipios(@Query("uf") uf: string) {
    return DADOS_ABERTOS.municipios(uf ?? "");
  }

  @Get("classificacoes-tributarias")
  @ApiOperation({ summary: "Classificações tributárias (cClassTrib) vigentes na data" })
  classificacoesTributarias(@Query("data") data?: string) {
    return DADOS_ABERTOS.classificacoesTributarias(data ?? hoje());
  }

  @Get("classificacoes-tributarias/:codigo")
  @ApiOperation({ summary: "Detalhe de uma classificação tributária" })
  classificacaoTributaria(@Query("codigo") codigo: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.classificacaoTributaria(codigo, data ?? hoje());
  }

  @Get("situacoes-tributarias/cbs-ibs")
  @ApiOperation({ summary: "Situações tributárias (CST) de CBS e IBS" })
  situacoesCbsIbs(@Query("data") data?: string) {
    return DADOS_ABERTOS.situacoesTributarias("cbs-ibs", data ?? hoje());
  }

  @Get("situacoes-tributarias/is")
  @ApiOperation({ summary: "Situações tributárias (CST) do Imposto Seletivo" })
  situacoesIs(@Query("data") data?: string) {
    return DADOS_ABERTOS.situacoesTributarias("is", data ?? hoje());
  }

  @Get("ncm")
  @ApiOperation({ summary: "Consulta NCM por prefixo (paginada)" })
  ncm(
    @Query("prefixo") prefixo = "",
    @Query("limite", new DefaultValuePipe(20), ParseIntPipe) limite = 20,
    @Query("pagina", new DefaultValuePipe(0), ParseIntPipe) pagina = 0,
  ) {
    return DADOS_ABERTOS.ncm(prefixo, Math.min(limite, 200), pagina);
  }

  @Get("nbs")
  @ApiOperation({ summary: "Consulta NBS por prefixo (paginada)" })
  nbs(
    @Query("prefixo") prefixo = "",
    @Query("limite", new DefaultValuePipe(20), ParseIntPipe) limite = 20,
    @Query("pagina", new DefaultValuePipe(0), ParseIntPipe) pagina = 0,
  ) {
    return DADOS_ABERTOS.nbs(prefixo, Math.min(limite, 200), pagina);
  }

  @Get("aliquota-referencia")
  @ApiOperation({ summary: "Alíquotas de referência (CBS, IBS-UF, IBS-Município)" })
  aliquotasReferencia(@Query("data") data?: string) {
    return DADOS_ABERTOS.aliquotasReferencia(data ?? hoje());
  }

  @Get("fundamentacoes-legais")
  @ApiOperation({ summary: "Fundamentações legais por classificação tributária" })
  fundamentacoes(@Query("data") data?: string) {
    return DADOS_ABERTOS.fundamentacoes(data ?? hoje());
  }

  @Get("tipos-documento")
  @ApiOperation({ summary: "Tipos de documento fiscal eletrônico (tpDoc) vigentes" })
  tiposDocumento(@Query("data") data?: string) {
    return DADOS_ABERTOS.tiposDfe(data ?? hoje());
  }


  @Get("classificacoes-tributarias/cbs-ibs/:cst")
  @ApiOperation({ summary: "Classificações tributárias (CBS e IBS) aplicáveis a uma CST" })
  classificacoesPorCstCbsIbs(@Query("cst") cst: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.classificacoesPorCst(cst, 2, data ?? hoje());
  }

  @Get("classificacoes-tributarias/imposto-seletivo/:cst")
  @ApiOperation({ summary: "Classificações tributárias (Imposto Seletivo) aplicáveis a uma CST" })
  classificacoesPorCstIs(@Query("cst") cst: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.classificacoesPorCst(cst, 1, data ?? hoje());
  }

  @Get("redutores-compra-governamental")
  @ApiOperation({ summary: "Redutores de compra governamental vigentes" })
  redutoresCompraGov(@Query("data") data?: string) {
    return DADOS_ABERTOS.redutoresCompraGov(data ?? hoje());
  }

  @Get("transferencias-cbs")
  @ApiOperation({ summary: "Percentuais de transferência de CBS entre entes federativos" })
  transferenciasCBS(@Query("data") data?: string) {
    return DADOS_ABERTOS.transferenciasCBS(data ?? hoje());
  }

  @Get("unidades-medida")
  @ApiOperation({ summary: "Unidades de medida vigentes" })
  unidadesMedida(@Query("data") data?: string) {
    return DADOS_ABERTOS.unidadesMedida(data ?? hoje());
  }
}
