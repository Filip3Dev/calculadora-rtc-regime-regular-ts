/**
 * Dados abertos — consultas às tabelas oficiais usadas no cálculo.
 */
import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
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

  @Get("classificacoes-tributarias/nbs")
  @ApiOperation({ summary: "Classificações tributárias aplicáveis a uma NBS (vinculadas + serviços sem vínculo)" })
  classificacoesPorNbs(@Query("nbs") nbs: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.classificacoesAplicaveisPorNbs(nbs, data ?? hoje());
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
  classificacoesPorCstCbsIbs(@Param("cst") cst: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.classificacoesPorCst(cst, 2, data ?? hoje());
  }

  @Get("classificacoes-tributarias/imposto-seletivo/:cst")
  @ApiOperation({ summary: "Classificações tributárias (Imposto Seletivo) aplicáveis a uma CST" })
  classificacoesPorCstIs(@Param("cst") cst: string, @Query("data") data?: string) {
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

  @Get("ncm/vigentes")
  @ApiOperation({ summary: "NCMs vigentes na data (código e descrição)" })
  ncmVigentes(@Query("data") data?: string) {
    return DADOS_ABERTOS.ncmVigentes(data ?? hoje());
  }

  @Get("nbs/lista")
  @ApiOperation({ summary: "Lista completa de NBS vigentes na data" })
  nbsLista(@Query("data") data?: string) {
    return DADOS_ABERTOS.listarNbs(data ?? hoje());
  }

  @Get("nbs-aplicaveis")
  @ApiOperation({ summary: "NBS aplicáveis a uma classificação tributária (todas, se sem vínculo)" })
  nbsAplicaveis(@Query("cClassTrib") cClassTrib: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.nbsAplicaveisPorClassificacao(cClassTrib, data ?? hoje());
  }

  @Get("aliquota-uniao")
  @ApiOperation({ summary: "Alíquota de referência da CBS (União)" })
  aliquotaUniao(@Query("data") data?: string) {
    return DADOS_ABERTOS.aliquotaDadosAbertos(2, null, null, data ?? hoje());
  }

  @Get("aliquota-uf")
  @ApiOperation({ summary: "Alíquota de referência/padrão do IBS-UF" })
  aliquotaUf(@Query("codigoUf") codigoUf: number, @Query("data") data?: string) {
    return DADOS_ABERTOS.aliquotaDadosAbertos(3, codigoUf, null, data ?? hoje());
  }

  @Get("aliquota-municipio")
  @ApiOperation({ summary: "Alíquota de referência/padrão do IBS-Município" })
  aliquotaMunicipio(@Query("codigoMunicipio") codigoMunicipio: number, @Query("data") data?: string) {
    return DADOS_ABERTOS.aliquotaDadosAbertos(4, null, codigoMunicipio, data ?? hoje());
  }

  @Get("transferencias-ibs")
  @ApiOperation({ summary: "Percentuais de transferência do IBS entre entes (tabela fixa vigente)" })
  transferenciasIBS() {
    // PARITY: lista fixa do original (consultarTransferenciasIBS)
    return [
      { valor: "0", inicioVigencia: "2026-01-01", fimVigencia: "2026-12-31" },
      { valor: "100", inicioVigencia: "2027-01-01", fimVigencia: null },
    ];
  }

  @Get("dfe/grupos")
  @ApiOperation({ summary: "Grupos de documentos fiscais eletrônicos" })
  gruposDfe(@Query("data") data?: string) {
    return DADOS_ABERTOS.gruposDfe(data ?? hoje());
  }

  @Get("ator/grupos")
  @ApiOperation({ summary: "Grupos de atores (regimes/contribuintes)" })
  gruposAtor(@Query("data") data?: string) {
    return DADOS_ABERTOS.gruposAtor(data ?? hoje());
  }

  @Get("classificacoes-tributarias/cbs-ibs/class-trib/:cClassTrib")
  @ApiOperation({ summary: "Detalhe de uma classificação tributária (CBS e IBS) por código" })
  classificacaoCbsIbsPorCodigo(@Param("cClassTrib") cClassTrib: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.detalheClassificacao(cClassTrib, 2, data ?? hoje());
  }

  @Get("classificacoes-tributarias/is/class-trib/:cClassTrib")
  @ApiOperation({ summary: "Detalhe de uma classificação tributária (Imposto Seletivo) por código" })
  classificacaoIsPorCodigo(@Param("cClassTrib") cClassTrib: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.detalheClassificacao(cClassTrib, 1, data ?? hoje());
  }

  @Get("ncm-aplicavel")
  @ApiOperation({ summary: "Valida se uma NCM é aplicável à classificação tributária" })
  async ncmAplicavel(@Query("cClassTrib") cClassTrib: string, @Query("ncm") ncm: string, @Query("data") data?: string) {
    return DADOS_ABERTOS.validarNcmAplicavel(cClassTrib, ncm, data ?? hoje());
  }

  @Get("unidades-medida")
  @ApiOperation({ summary: "Unidades de medida vigentes" })
  unidadesMedida(@Query("data") data?: string) {
    return DADOS_ABERTOS.unidadesMedida(data ?? hoje());
  }
}
