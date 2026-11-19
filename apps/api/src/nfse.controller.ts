/**
 * NFS-e — porte dos endpoints do NfseController oficial.
 */
import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JBD } from "@rtc/core";
import { calculadora } from "./calc.provider.js";
import { BodyExemplo, NFSE_BASE_CALCULO, RespostaOk, RespostaProblem422 } from "./swagger-exemplos.js";
import {
  LOCAIS_FORNECIMENTO,
  LOCAIS_INCIDENCIA,
  OpcaoSimplesNacional,
  RegimeApuracaoIbsCbsSN,
  formatarCTribNac,
} from "@rtc/core";

const hoje = () => new Date().toISOString().slice(0, 10);

interface NfseBaseCalculoRequest {
  anoFatoGerador: number;
  valorServico: number | string;
  descontoIncondicional?: number | string;
  vCalcReeRepRes?: number | string;
  vCalcDedRedIBSCBS?: number | string;
  iss?: number | string;
  pis?: number | string;
  cofins?: number | string;
}

@ApiTags("nfse")
@Controller("calculadora/nfse")
export class NfseController {
  /** POST /api/calculadora/nfse/base-calculo */
  @Post("base-calculo")
  @HttpCode(200)
  @BodyExemplo("Ano ≥ 2026; PIS/COFINS só até 2027, ISS até 2033", NFSE_BASE_CALCULO)
  @RespostaOk("Base de cálculo NFS-e", { baseCalculo: "890.00" })
  @RespostaProblem422()
  @ApiOperation({ summary: "Cálculo da base de cálculo de CBS e IBS em operações de NFS-e" })
  baseCalculo(@Body() req: NfseBaseCalculoRequest) {
    return calculadora().calcularNfseBaseCalculo({
      anoFatoGerador: req.anoFatoGerador,
      valorServico: JBD.of(req.valorServico)!,
      descontoIncondicional: JBD.of(req.descontoIncondicional ?? 0) ?? JBD.ZERO,
      vCalcReeRepRes: JBD.of(req.vCalcReeRepRes ?? 0) ?? JBD.ZERO,
      vCalcDedRedIBSCBS: JBD.of(req.vCalcDedRedIBSCBS ?? 0) ?? JBD.ZERO,
      iss: JBD.of(req.iss ?? 0) ?? JBD.ZERO,
      pis: JBD.of(req.pis ?? 0) ?? JBD.ZERO,
      cofins: JBD.of(req.cofins ?? 0) ?? JBD.ZERO,
    });
  }

  /** POST /api/calculadora/nfse/indicador-operacao/validate */
  @Post("indicador-operacao/validate")
  @HttpCode(200)
  @ApiOperation({ summary: "Valida a combinação NBS + cClassTrib + indicador de operação (+ lista LC 116 opcional)" })
  validarIndicadorOperacao(
    @Body()
    req: {
      cTribNac?: string | null;
      cIndOp: string;
      cClassTrib: string;
      nbs: string;
      dataOcorrenciaFatoGerador: string;
    },
  ) {
    return calculadora().nfseService.validarIndicadorOperacao({
      cTribNac: req.cTribNac ?? null,
      cIndOp: req.cIndOp,
      cClassTrib: req.cClassTrib,
      nbs: req.nbs,
      dataOcorrenciaFatoGerador: req.dataOcorrenciaFatoGerador?.slice(0, 10) ?? hoje(),
    });
  }

  /** GET /api/calculadora/nfse/local-operacao?cIndOp=&data= */
  @Get("local-operacao")
  @ApiOperation({ summary: "Local de fornecimento e de incidência de um indicador de operação" })
  localOperacao(@Query("cIndOp") cIndOp: string, @Query("data") data?: string) {
    return calculadora().nfseService.consultarLocalOperacao(cIndOp, data ?? hoje());
  }

  /** GET /api/calculadora/nfse/indicador-operacao?data=&nbs= */
  @Get("indicador-operacao")
  @ApiOperation({ summary: "Indicadores de operação vigentes na data (opcionalmente por NBS)" })
  indicadoresOperacao(@Query("data") data?: string, @Query("nbs") nbs?: string) {
    return calculadora().nfseService.consultarIndicadoresOperacao(data ?? hoje(), nbs ?? null);
  }

  /** GET /api/calculadora/nfse/locais-fornecimento?codigo= */
  @Get("locais-fornecimento")
  @ApiOperation({ summary: "Catálogo de locais de fornecimento" })
  locaisFornecimento(@Query("codigo") codigoStr?: string) {
    const listar = () => Object.entries(LOCAIS_FORNECIMENTO).map(([cod, desc]) => ({ codigo: Number(cod), descricao: desc }));
    const codigo = codigoStr !== undefined && codigoStr !== "" && /^\d+$/.test(codigoStr) ? Number(codigoStr) : null;
    if (codigo !== null) {
      if (!(codigo in LOCAIS_FORNECIMENTO)) return [];
      return [{ codigo, descricao: LOCAIS_FORNECIMENTO[codigo] }];
    }
    return listar();
  }

  /** GET /api/calculadora/nfse/locais-incidencia?codigo= */
  @Get("locais-incidencia")
  @ApiOperation({ summary: "Catálogo de locais de incidência" })
  locaisIncidencia(@Query("codigo") codigoStr?: string) {
    const listar = () => Object.entries(LOCAIS_INCIDENCIA).map(([cod, desc]) => ({ codigo: Number(cod), descricao: desc }));
    const codigo = codigoStr !== undefined && codigoStr !== "" && /^\d+$/.test(codigoStr) ? Number(codigoStr) : null;
    if (codigo !== null) {
      if (!(codigo in LOCAIS_INCIDENCIA)) return [];
      return [{ codigo, descricao: LOCAIS_INCIDENCIA[codigo] }];
    }
    return listar();
  }

  /** GET /api/calculadora/nfse/situacoes-classificacoes-tributarias?nbs=&data= */
  @Get("situacoes-classificacoes-tributarias")
  @ApiOperation({ summary: "Situações e classificações tributárias aplicáveis a uma NBS" })
  situacoesClassificacoes(@Query("nbs") nbs: string, @Query("data") data?: string) {
    return calculadora().nfseService.consultarSituacoesClassificacoesPorNbs(nbs, data ?? hoje());
  }

  /** Utilitário Swagger: formatação cTribNac (expõe o formato usado na validação). */
  @Get("c-trib-nac")
  @ApiOperation({ summary: "Formata um código cTribNac (1400 → 1.40; 109052 → 1.09.05)" })
  formatar(@Query("codigo") codigo: string) {
    return { cTribNac: codigo, formatado: formatarCTribNac(codigo) };
  }
}

